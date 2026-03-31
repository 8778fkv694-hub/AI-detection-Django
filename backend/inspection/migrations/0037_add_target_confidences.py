"""Add target_confidences to StageRecipeTemplate for per-target confidence override"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inspection', '0036_add_device_action_map'),
    ]

    operations = [
        migrations.AddField(
            model_name='stagerecipetemplate',
            name='target_confidences',
            field=models.JSONField(blank=True, default=dict, help_text='每个目标独立置信度覆盖'),
        ),
    ]
