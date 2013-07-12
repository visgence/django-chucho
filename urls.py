from django.conf.urls import patterns, url

urlpatterns = patterns(
     'chucho.views'
    ,url(r'(?i)model_editor/(?P<app_name>.+)/(?P<model_name>.+)/$',
        'model_grid', name='chucho-model-editor')
    
    ,url(r'filters/$', 'get_filter_operators', name="chucho-filter-operators")
    ,url(r'columns/(?P<app_name>.+)/(?P<model_name>.+)/$', 'get_columns', name="chucho-columns")
    ,url(r'(?P<app_name>.+)/(?P<model_name>.+)/$', 'api_view', name="chucho-api")
)
