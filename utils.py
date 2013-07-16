"""
" chucho/utils.py
" Contributing Authors:
"    Evan Salazar   (Visgence, Inc)
"    Jeremiah Davis (Visgence, Inc)
"    Bretton Murphy (Visgence, Inc)
"
" (c) 2013 Visgence, Inc.
"""

#System Imports
from django.db import models
import re



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


def get_column_options(cls):
    '''
    ' Use a model class to get the _meta.column_options, if they exist.
    '''
    try:
        return cls.column_options
    except:
        return {}


def gen_fk_filter_cols(model):

    rel_cols = []
    fields = get_meta_fields(model)
    if hasattr(model, 'search_fields'):
        fields = [f for f in fields if f.name in model.search_fields]
    
    for f in fields:
        rel_col = {
            'name': f.name,
            'related': []
        }         
        
        if isinstance(f, models.ForeignKey):
            rel_col['related'] = gen_fk_filter_cols(f.related.parent_model)

        rel_cols.append(rel_col)

    return rel_cols


def gen_columns(modelObj, search_filtering=False):
    columns = []
    column_options = get_column_options(modelObj)
    for f in get_meta_fields(modelObj):

        #We don't care about these fields
        if f.name.endswith('_ptr'):
            continue

        field = {
            'field': f.name,
            'name': f.name.title(),
            'id': f.name,
            'sortable': True,
            'grid_column': True,
            'filter_column': {
                'name': f.name,
                'related': []
            }
        }
        
        if hasattr(modelObj, 'search_fields') and f.name not in modelObj.search_fields:
            del field['filter_column']

            if search_filtering:
                continue


        #if f.name in ['name', 'id']:
        #    field['sortable'] = True
        # Make sure to give the type and other meta data for the columns.
        if f.primary_key or not f.editable:
            field['_editable'] = False
        else:
            field['_editable'] = True

        #Figure out what each field is and store that type
        if isinstance(f, models.ForeignKey):
            field['filter_column']['related'] = gen_columns(f.related.parent_model, True)
            field['model_name'] = f.rel.to.__name__
            field['app'] = f.rel.to._meta.app_label
            field['_type'] = 'foreignkey'
            field['blank'] = f.blank
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
        elif isinstance(f, models.DecimalField) or isinstance(f, models.FloatField):
            field['_type'] = 'decimal'
        elif isinstance(f, models.DateTimeField):
            field['_type'] = 'datetime'
        elif isinstance(f, models.DateField):
            field['_type'] = 'date'
        elif isinstance(f, models.TextField):
            field['_type'] = 'text'
        elif isinstance(f, models.CharField):
            #Try and see if this field was meant to hold colors
            if re.match('color$', f.name.lower()):
                field['_type'] = 'color'
            else:
                field['_type'] = 'char'

        elif f.name not in column_options:
            raise Exception("In gen_columns: The field type %s is not handled." % type(f))

        # Apply any custom options for the field.
        if f.name in column_options:
            field.update(column_options[f.name])

        columns.append(field)
    
    for m in get_meta_m2m(modelObj):
        columns.append({
            'field': m.name,
            'name': m.name.title(),
            'id': m.name,
            'model_name': m.rel.to.__name__,
            'app': m.rel.to._meta.app_label,
            '_type': 'm2m',
            '_editable': True,
            'grid_column': True
        })
    
    return columns



