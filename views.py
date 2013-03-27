"""
" chucho/views.py
" Contributing Authors:
"    Evan Salazar   (Visgence, Inc)
"    Jeremiah Davis (Visgence, Inc)
"
" (c) 2013 Visgence, Inc.
"""

# System Imports
from django.db import models
from django.http import HttpResponse
from django.template import RequestContext, loader
from django.contrib.auth import get_user_model
import re
import datetime

# Local Imports
from django.conf import settings
AuthUser = settings.get_permission_obj()

def model_grid(request, app_name, model_name):
    '''
    ' View to return the html that will hold a models chucho.
    '''

    t = loader.get_template('chucho.html')
    c = RequestContext(request, {'model_name': model_name, 'app_name': app_name})
    return HttpResponse(t.render(c), mimetype="text/html")


def genColumns(modelObj):
    columns = []
    for f in get_meta_fields(modelObj):

        #We don't care about these fields
        if f.name.endswith('_ptr'):
            continue

        field = {'field': f.name, 'name': f.name.title(), 'id': f.name}
        #if f.name in ['name', 'id']:
        #    field['sortable'] = True
        # Make sure to give the type and other meta data for the columns.
        if f.primary_key or not f.editable:
            field['_editable'] = False
        else:
            field['_editable'] = True

        #Figure out what each field is and store that type
        if isinstance(f, models.ForeignKey):
            field['model_name'] = f.rel.to.__name__
            field['app'] = f.rel.to._meta.app_label
            field['_type'] = 'foreignkey'
        elif len(f.choices) > 0:
            field['_type'] = 'choice'
            field['choices'] = []

            for c in f.choices:
                choice = {
                    'value': c[0],
                    '__unicode__': c[1]
                }
                field['choices'].append(choice)
        elif isinstance(f, models.BooleanField):
            field['_type'] = 'boolean'
        elif isinstance(f, models.IntegerField) or isinstance(f, models.AutoField):
            field['_type'] = 'integer'
        elif isinstance(f, models.DecimalField):
            field['_type'] = 'decimal'
        elif isinstance(f, models.DateTimeField):
            field['_type'] = 'datetime'
        elif isinstance(f, models.TextField):
            field['_type'] = 'text'
        elif isinstance(f, models.CharField):
            # See if this is a password field.
            if f.model == AuthUser and f.name == 'password':
                field['_type'] = 'auth_password'
            #Try and see if this field was meant to hold colors
            elif re.match('color$', f.name.lower()):
                field['_type'] = 'color'
            else:
                field['_type'] = 'char'

        else:
            raise Exception("In genColumns: The field type %s is not handled." % type(f))

        columns.append(field)
    for m in get_meta_m2m(modelObj):
        columns.append({
            'field': m.name,
            'name': m.name.title(),
            'id': m.name,
            'model_name': m.rel.to.__name__,
            'app': m.rel.to._meta.app_label,
            '_type': 'm2m',
            '_editable': True
        })

    return columns


def get_meta_fields(cls):
    '''
    ' Use a model class to get the _meta fields.
    '''
    return cls._meta.fields


def get_meta_m2m(cls):
    '''
    ' Use a model class to get the _meta ManyToMany fields
    '''
    return cls._meta.many_to_many
