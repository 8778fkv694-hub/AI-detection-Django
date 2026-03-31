from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inspection', '0037_add_target_confidences'),
    ]

    operations = [
        migrations.AddField(
            model_name='stagerecipetemplate',
            name='fixture_enabled',
            field=models.BooleanField(default=True),
        ),
    ]
