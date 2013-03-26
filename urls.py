from django.conf.urls import patterns, include, url

urlpatterns = patterns(
    'crud.views',
    url(r'(?i)model_editor/(?P<app_name>.+)/(?P<model_name>.+)/$',
        'model_grid', name='crud-model-editor')
)
