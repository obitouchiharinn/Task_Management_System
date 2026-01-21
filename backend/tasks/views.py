from typing import List, Tuple

from django.db import transaction
from django.db.models import QuerySet
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from .models import Task, TaskDependency
from .serializers import TaskSerializer, TaskDependencySerializer


def _build_graph() -> dict[int, List[int]]:
    graph: dict[int, List[int]] = {}
    for dep in TaskDependency.objects.all():
        graph.setdefault(dep.task_id, []).append(dep.depends_on_id)
    return graph


def detect_cycle(start_task_id: int) -> Tuple[bool, List[int]]:
    """
    Depth‑first search to detect a cycle reachable from start_task_id.
    Returns (is_circular, path_if_circular).
    """
    graph = _build_graph()
    visited: set[int] = set()
    stack: set[int] = set()
    path: List[int] = []

    def dfs(node: int) -> bool:
        visited.add(node)
        stack.add(node)
        path.append(node)

        for neighbor in graph.get(node, []):
            if neighbor not in visited:
                if dfs(neighbor):
                    return True
            elif neighbor in stack:
                path.append(neighbor)
                return True

        stack.remove(node)
        path.pop()
        return False

    has_cycle = dfs(start_task_id)
    return has_cycle, path if has_cycle else []


def auto_update_task_status(task: Task) -> None:
    deps: QuerySet[Task] = Task.objects.filter(dependents__task=task)

    if not deps.exists():
        # No dependencies → keep current status unless blocked.
        return

    if deps.filter(status=Task.STATUS_BLOCKED).exists():
        task.status = Task.STATUS_BLOCKED
    elif deps.filter(status__in=[Task.STATUS_PENDING, Task.STATUS_IN_PROGRESS]).exists():
        task.status = Task.STATUS_PENDING
    elif deps.filter(status=Task.STATUS_COMPLETED).count() == deps.count():
        task.status = Task.STATUS_IN_PROGRESS

    task.save(update_fields=["status"])


class TaskViewSet(viewsets.ModelViewSet):
    queryset = Task.objects.all().order_by("-created_at")
    serializer_class = TaskSerializer

    @action(detail=True, methods=["post"])
    def dependencies(self, request: Request, pk: str | None = None) -> Response:
        """
        POST /api/tasks/{task_id}/dependencies/
        Body: {"depends_on_id": 5}
        """
        task = self.get_object()
        depends_on_id = request.data.get("depends_on_id")
        if depends_on_id is None:
            return Response(
                {"error": "depends_on_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if int(depends_on_id) == task.id:
            return Response(
                {"error": "Task cannot depend on itself"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        depends_on = Task.objects.filter(pk=depends_on_id).first()
        if not depends_on:
            return Response(
                {"error": "depends_on task not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            TaskDependency.objects.get_or_create(task=task, depends_on=depends_on)

            is_circular, path = detect_cycle(task.id)
            if is_circular:
                transaction.set_rollback(True)
                return Response(
                    {
                        "error": "Circular dependency detected",
                        "path": path,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = TaskDependencySerializer(
            TaskDependency.objects.get(task=task, depends_on=depends_on)
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class TaskDependencyViewSet(viewsets.ModelViewSet):
    queryset = TaskDependency.objects.all()
    serializer_class = TaskDependencySerializer

