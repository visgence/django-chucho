"""
" trafficMonitor/ajax.py
" Contributing Authors:
"    Evan Salazar   (Visgence, Inc)
"    Jeremiah Davis (Visgence, Inc)
"    Bretton Murphy (Visgence, Inc)
"
" (c) 2013 Visgence, Inc.
"""

# System imports
try:
    import simplejson as json
except ImportError:
    import json

from dajaxice.decorators import dajaxice_register
from django.core.exceptions import ValidationError
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from django.db import models, transaction
from django.template import Context, loader
from django.utils.timezone import utc, make_naive,  make_aware, is_aware, get_current_timezone
from datetime import datetime
from calendar import timegm
from sys import stderr

# Local imports
from settings import get_permission_obj, DT_FORMAT, D_FORMAT
try:
    from settings import USER_TZ
except:
    USER_TZ = False
AuthUser = get_permission_obj()
from views import genColumns
from check_access import check_access

filter_operators = {
    '=': 'exact',
    '= (no case)': 'iexact',
    'Contains String': 'contains',
    'Contains (No Case)': 'icontains',
    'Starts With String': 'startswith',
    'Starts With (No Case)': 'istartswith',
    'Ends With String': 'endswith',
    'Ends With (No Case)': 'iendswith',
    'Element In': 'in',
    '>': 'gt',
    '>=': 'gte',
    '<': 'lt',
    '<=': 'lte',
    'Is Null': 'isnull',
    'Regular Expression': 'regex',
    'Regular Expression (No Case)': 'iregex'
    }


@dajaxice_register
def get_filter_operators(request):
    '''
    ' Return JSON dump of dict of list of select option elements.
    ' This is used by the filter tool in the ui.
    '''
    user = check_access(request)
    if user is None:
        errors = 'User is not logged in properly.'
        return json.dumps({'errors': errors})

    operators = filter_operators.keys()
    operators.sort()
    return json.dumps(operators)

# c_operators = Context({'select_title': 'Select Operator', 'options': operators})

#     cls = models.loading.get_model(app_name, model_name)
#     try:
#         columns = cls.filter_columns
#         columns.sort()
#         c_columns = Context({'select_title': 'Select Column', 'options': columns})
#     except AttributeError:
#         columns = [f.name for f in cls._meta.fields]
#         print columns
#         columns.sort()
#         print columns
#         c_columns = Context({'select_title': 'Select Column', 'options': columns})
#     options = {
#         'operators': t.render(c_operators),
#         'columns': t.render(c_columns)
#         }
#     return json.dumps(options)


@dajaxice_register
def read_source(request, app_name, model_name, get_editable, result_info=None):
    '''
    ' Returns - Dictionary serialized as json:
    '           'data' - paged data from a given model
    '           'page_list' - page buttons html
    '           'errors' - Errors reported to client.
    '
    ' Keyword Args:
    '    app_name     - (string) The application the desired model resides in
    '    model_name   - (string) The model name to get serialized data from
    '    get_editable - (bool)   True if you are getting the editable objects, false if only the viewable.
    '    result_info  - (serialized json) This optional serialized json should contain a dictionary with
    '                   the following possible keys:
    '                       filter_args - A list of dictionaries with keys:
    '                                     col  - Column name to filter on.
    '                                     oper - The filter operation to perform.
    '                                     val  - The value to filter against.
    '                       sort_columns - A list of dictionaries with keys (directly from slick-grid):
    '                                     'sortAsc'  - Sort ascending or descending
    '                                     'columnId' - Name of the column to sort on.
    '                       page - The page to data to return
    '                       per_page - The number of items on a page.
    '''
    user = check_access(request)
    if user is None:
        errors = 'User is not logged in properly.'
        return json.dumps({'errors': errors})

    extras = {}

    if result_info is not None:
        result_info = json.loads(result_info)
    else:
        result_info = {}

    if 'filter_args' in result_info:
        filter_args = result_info['filter_args']
    else:
        filter_args = None
        
    kwargs = None    
    if filter_args is not None:
        kwargs = {}
        for i in filter_args:
            keyword = i['col'] + '__' + filter_operators[i['oper']]
            kwargs[keyword] = i['val']

    cls = models.loading.get_model(app_name, model_name)

    read_only = False
    try:
        #Only get the objects that can be edited by the user logged in
        if get_editable and cls.objects.can_edit(user):
            objs = cls.objects.get_editable(user, kwargs)
        else:
            objs = cls.objects.get_viewable(user, kwargs)
            read_only = True
    except Exception as e:
        stderr.write('Unknown error occurred in read_source: %s: %s\n' % (type(e), e.message))
        stderr.flush()
        return json.dumps({'errors': 'Unknown error occurred in read_source: %s: %s' % (type(e), e.message)})

    extras['read_only'] = read_only

    # Order the data
    if 'sort_columns' in result_info and len(result_info['sort_columns']) > 0:
        if result_info['sort_columns'][0]['sortAsc']:
            sort_arg = result_info['sort_columns'][0]['columnId']
        else:
            sort_arg = '-' + result_info['sort_columns'][0]['columnId']
        objs = objs.order_by(sort_arg)
    
    # Break the data into pages
    if 'page' in result_info and 'per_page' in result_info:
        paginator = Paginator(objs, result_info['per_page'])
        try:
            objs = paginator.page(result_info['page'])
        except PageNotAnInteger:
            objs = paginator.page(1)
        except EmptyPage:
            objs = paginator.page(paginator.num_pages)

        # Creat list of pages to render links for
        pages = []
        for i in paginator.page_range:
            if i == objs.number or \
                    i <= 3 or \
                    (i <= objs.number + 2 and i >= objs.number - 2) or \
                    (i <= paginator.num_pages and i >= paginator.num_pages - 2):
                if len(pages) > 0 and i - 1 > pages[-1]:
                    pages.append(-1)
                pages.append(i)
            
        t_pages = loader.get_template('page_list.html')
        c_pages = Context({'curr_page': objs, 'pages': pages})
        extras['page_list'] = t_pages.render(c_pages)

    return serialize_model_objs(objs, extras)


@dajaxice_register
@transaction.commit_manually
def update(request, app_name, model_name, data):
    '''
    ' Modifies a model object with the given data, saves it to the db and
    ' returns it as serialized json.
    '
    ' Keyword Args:
    '    model_name  - The name of the model object to modify.
    '    data - The data to modify the object with.
    '
    ' Returns:
    '    The modified object serialized as json.
    '''

    user = check_access(request)
    if user is None:
        errors = 'User is not logged in properly.'
        return json.dumps({'errors': errors})

    cls = models.loading.get_model(app_name, model_name)
    if 'pk' not in data:
        if not cls.objects.can_edit(user):
            transaction.rollback()
            return json.dumps({'errors': 'User %s does not have permission to add to this table.' % str(user)})
        obj = cls()
    else:
        try:
            obj = cls.objects.get_editable_by_pk(user, pk=data['pk'])
            if obj is None:
                transaction.rollback()
                return json.dumps({'errors': 'User %s does not have permission to edit this object' % str(user)})
        except Exception as e:
            transaction.rollback()
            return json.dumps({'errors': 'Cannot load object to save: Exception: ' + e.message})

    fields = genColumns(obj)
    m2m = []
    try:
        for field in fields:
            if field['_editable']:

                #save inportant m2m stuff for after object save
                if field['_type'] == 'm2m':
                    m2m.append({
                        'field': field['field'],
                        'model_name': field['model_name'],
                        'app': field['app']
                    })
                    continue

                # Handle empy data
                elif data[field['field']] in [None, ''] and field['_type'] != 'auth_password':
                    if field['_type'] in ['text', 'char', 'color']:
                        setattr(obj, field['field'], '')
                    else:
                        setattr(obj, field['field'], None)

                elif field['_type'] == 'foreignkey':
                    rel_cls = models.loading.get_model(field['app'], field['model_name'])
                    rel_obj = rel_cls.objects.get(pk=data[field['field']]['pk'])
                    if rel_obj.can_view(user):
                        setattr(obj, field['field'], rel_obj)
                    else:
                        transaction.rollback()
                        error = 'Error: You do not have permission to assign this object: %s' % rel_obj
                        return json.dumps({'errors': error})

                elif field['_type'] == 'datetime':
                    if USER_TZ:
                        dt_obj = make_aware(datetime.utcfromtimestamp(data[field['field']]), utc)
                    else:
                        aware_dt_obj = make_aware(datetime.utcfromtimestamp(data[field['field']]), utc)
                        dt_obj = make_naive(aware_dt_obj, get_current_timezone())

                    setattr(obj, field['field'], dt_obj)

                elif field['_type'] == 'date':
                    dt_obj = datetime.strptime(data[field['field']], D_FORMAT)
                    setattr(obj, field['field'], dt_obj.date())

                elif field['_type'] == 'auth_password':
                    if data[field['field']] not in [None, '']:
                        obj.set_password(data[field['field']])

                else:
                    setattr(obj, field['field'], data[field['field']])
        obj.save()

        try:
            #Get all respective objects for many to many fields and add them in.
            for m in m2m:
                cls = models.loading.get_model(m['app'], m['model_name'])
                m2m_objs = []
                for m2m_obj in data[m['field']]:
                    rel_obj = cls.objects.get(pk=m2m_obj['pk'])
                    if rel_obj.can_view(user):
                        m2m_objs.append(rel_obj)
                    else:
                        transaction.rollback()
                        error = 'Error: You do not have permission to assign this object: %s' % rel_obj
                        return json.dumps({'errors': error})

                setattr(obj, m['field'], m2m_objs)

        except Exception as e:
            transaction.rollback()
            error = 'Error setting ManyToMany fields: %s: %s' % (type(e), e.message)
            stderr.write(error)
            stderr.flush()
            transaction.rollback()
            return json.dumps({'errors': error})

    except Exception as e:
        transaction.rollback()
        error = 'In ajax update exception: %s: %s\n' % (type(e), e.message)
        stderr.write(error)
        stderr.flush()
        return json.dumps({'errors': error})

    # Run validations
    try:
        obj.full_clean()
    except ValidationError as e:
        transaction.rollback()
        errors = 'ValiationError '
        for field_name, error_messages in e.message_dict.items():
            errors += ' ::Field: %s: Errors: %s ' % (field_name, ','.join(error_messages))

        return json.dumps({'errors': errors})

    try:
        serialized_model = serialize_model_objs([obj.__class__.objects.get(pk=obj.pk)], {'read_only':True})
    except Exception as e:
        transaction.rollback()
        error = 'In ajax update exception: %s: %s\n' % (type(e), e.message)
        stderr.write(error)
        stderr.flush()
        return json.dumps({'errors': error})

    transaction.commit()
    return serialized_model


@dajaxice_register
def destroy(request, app_name, model_name, data):
    '''
    ' Receive a model_name and data object via ajax, and remove that item,
    ' returning either a success or error message.
    '''
    user = check_access(request)
    if user is None:
        errors = 'User is not logged in properly.'
        return json.dumps({'errors': errors})

    cls = models.loading.get_model(app_name, model_name)
    try:
        obj = cls.objects.get_editable_by_pk(user, data['pk'])
        if obj is None:
            error = "User %s does not have permission to delete this object." % user
            return json.dumps({'errors': error})
    except Exception as e:
        error = "There was an error for user %s trying to delete this object: %s" % (user, str(e))
        return json.dumps({'errors': error})

    obj.delete()
    return json.dumps({'success': 'Successfully deleted item with primary key: %s' % data['pk']})


@dajaxice_register
def get_columns(request, app_name, model_name):
    '''
    ' Return a JSON serialized column list for rendering a grid representing a
    ' model.
    '
    ' Keyword args:
    '   model_name - The name of the model to represent.
    '''

    user = check_access(request)
    if user is None:
        errors = 'User is not logged in properly.'
        return json.dumps({'errors': errors})

    cls = models.loading.get_model(app_name, model_name)
    return json.dumps(genColumns(cls))


def serialize_model_objs(objs, extras):
    '''
    ' Takes a list of model objects and returns the serialization of them.
    '
    ' Keyword Args:
    '    objs - The objects to serialize
    '''
    new_objs = []
    for obj in objs:
        fields = obj._meta.fields
        m2m_fields = obj._meta.many_to_many
        obj_dict = {}
        for f in fields:

            #Set value of field for the object.
            obj_dict[f.name] = f.value_from_object(obj)

            # What to do when we have a choice field.
            if len(f.choices) > 0:
                default = f.default
                for c in f.choices:
                    choice = {
                        'value': c[0],
                        '__unicode__': c[1]
                    }

                    #See if we can find a choice that is set to this object or
                    #use a default value if not.
                    if c[0] == f.value_from_object(obj) or default == choice['value']:
                        obj_dict[f.name] = choice
                        break

            # Make sure not to send back the actual hashed password.
            if f.model == AuthUser and f.name == 'password':
                password = f.value_to_string(obj)
                if password.startswith('pbkdf2_sha256'):
                    obj_dict[f.name] = 'Hashed'
                else:
                    obj_dict[f.name] = 'Invalid'

            # Relations
            elif isinstance(f, models.fields.related.ForeignKey) or \
               isinstance(f, models.fields.related.OneToOneField):

                objFromName = getattr(obj, f.name)
                if objFromName is None:
                    unicodeStr = u''
                else:
                    unicodeStr = unicode(objFromName)

                obj_dict[f.name] = {
                    '__unicode__': unicodeStr,
                    'pk': f.value_from_object(obj),
                    'model_name': f.rel.to.__name__
                }

            # Datetime Field
            # TODO: expand for other time related fields)
            elif isinstance(f, models.fields.DateTimeField):
                dt_obj = f.value_from_object(obj)
                if dt_obj is not None:
                    if not USER_TZ and not is_aware(dt_obj):
                        aware_dt_obj = make_aware(dt_obj, get_current_timezone())
                        obj_dict[f.name] = timegm(aware_dt_obj.utctimetuple())
                    elif USER_TZ and is_aware(dt_obj):
                        obj_dict[f.name] = timegm(dt_obj.utctimetuple())
                    else:
                        error = "There is a datetime that is aware while USER_TZ is false! or vice-versa"
                        return json.dumps({"errors": error}) 

            elif isinstance(f, models.fields.DateField):
                d_obj = f.value_from_object(obj)
                if d_obj is not None:
                    obj_dict[f.name] = dt_obj.strftime(D_FORMAT)

            # Types that need to be returned as strings
            elif type(obj_dict[f.name]) not in [dict, list, unicode, int, long, float, bool, type(None)]:
                obj_dict[f.name] = f.value_to_string(obj)

        if '__unicode__' not in obj_dict:
            obj_dict['__unicode__'] = unicode(obj)

        for m in m2m_fields:
            m_objs = getattr(obj, m.name).all()
            obj_dict[m.name] = []
            for m_obj in m_objs:
                obj_dict[m.name].append({
                    '__unicode__': unicode(m_obj),
                    'pk': m_obj.pk,
                    'model_name': m.rel.to.__name__
                })

        if 'pk' not in obj_dict:
            obj_dict['pk'] = obj.pk

        new_objs.append(obj_dict)

    extras['data'] = new_objs
    return json.dumps(extras, indent=4)
