from django.db import models


class Task(models.Model):
    STATUS_PENDING = "pending"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_COMPLETED = "completed"
    STATUS_BLOCKED = "blocked"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_IN_PROGRESS, "In Progress"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_BLOCKED, "Blocked"),
    ]

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:  # pragma: no cover - human readable only
        return f"{self.title} ({self.status})"


class TaskDependency(models.Model):
    task = models.ForeignKey(
        Task, related_name="dependencies", on_delete=models.CASCADE
    )
    depends_on = models.ForeignKey(
        Task, related_name="dependents", on_delete=models.CASCADE
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("task", "depends_on")

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.task_id} depends on {self.depends_on_id}"
