"""新增移动视角/就位信号可选字段到 StageRecipeTemplate"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inspection', '0042_fqc_validation_rules'),
    ]

    operations = [
        migrations.AddField(
            model_name='stagerecipetemplate',
            name='turntable_enabled',
            field=models.BooleanField(default=False, help_text='启用移动视角多面采集联控'),
        ),
        migrations.AddField(
            model_name='stagerecipetemplate',
            name='turntable_start_command',
            field=models.CharField(blank=True, default='START_ROTATE\\n', help_text='触发采集时反向下发的启动旋转指令', max_length=64),
        ),
        migrations.AddField(
            model_name='stagerecipetemplate',
            name='turntable_stop_signal',
            field=models.CharField(blank=True, default='STOP_CAPTURE', help_text='移动视角就位完成信号(串口收到该字符串视为采集结束)', max_length=64),
        ),
        migrations.AddField(
            model_name='stagerecipetemplate',
            name='turntable_timeout_seconds',
            field=models.FloatField(default=30, help_text='等待就位信号的超时阈值(秒)，超时降级自动评估'),
        ),
    ]