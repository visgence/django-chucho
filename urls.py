from django.conf.urls import patterns, include, url

urlpatterns = patterns(
    'chucho.views',
    url(r'(?i)model_editor/(?P<app_name>.+)/(?P<model_name>.+)/$',
        'model_grid', name='chucho-model-editor')
)
