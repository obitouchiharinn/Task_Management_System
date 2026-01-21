from rest_framework import serializers

from .models import Task, TaskDependency


class TaskSerializer(serializers.ModelSerializer):
    depends_on = serializers.SerializerMethodField()
    dependents = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "description",
            "status",
            "created_at",
            "updated_at",
            "depends_on",
            "dependents",
        ]

    def get_depends_on(self, obj: Task) -> list[int]:
        # Tasks this task depends on
        return list(
            TaskDependency.objects.filter(task=obj).values_list("depends_on_id", flat=True)
        )

    def get_dependents(self, obj: Task) -> list[int]:
        # Tasks that depend on this task
        return list(
            TaskDependency.objects.filter(depends_on=obj).values_list("task_id", flat=True)
        )


class TaskDependencySerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskDependency
        fields = ["id", "task", "depends_on", "created_at"]

