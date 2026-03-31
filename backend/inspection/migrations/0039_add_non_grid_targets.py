from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inspection', '0038_add_fixture_enabled'),
    ]

    operations = [
        migrations.AddField(
            model_name='stagerecipetemplate',
            name='non_grid_targets',
            field=models.JSONField(blank=True, default=list, help_text='mini模式目标列表（不占格子，智能填充到空白区域）'),
        ),
    ]
