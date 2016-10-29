from django.conf.urls import url
import views

urlpatterns = [
    url(r'(?i)model_editor/(?P<app_name>.+)/(?P<model_name>.+)/$',
        views.model_grid, name='chucho-model-editor'),

    url(r'filters/$', views.get_filter_operators, name="chucho-filter-operators"),
    url(r'columns/(?P<app_name>.+)/(?P<model_name>.+)/$', views.get_columns, name="chucho-columns"),
    url(r'(?P<app_name>.+)/(?P<model_name>.+)/(?P<id>.+)/$', views.api_view, name="chucho-api"),
    url(r'(?P<app_name>.+)/(?P<model_name>.+)/$', views.api_view, name="chucho-api")
]
