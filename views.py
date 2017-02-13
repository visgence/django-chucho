"""
" chucho/views.py
" Contributing Authors:
"    Evan Salazar   (Visgence, Inc)
"    Jeremiah Davis (Visgence, Inc)
"    Bretton Murphy (Visgence, Inc)
"
" (c) 2013 Visgence, Inc.
"""

# System Imports
from sys import stderr
from datetime import datetime
from django.core.exceptions import ValidationError
from django.conf import settings
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from django.utils.timezone import utc, make_naive,  make_aware, get_current_timezone
from django.template import RequestContext, loader, Context
from django.http import HttpResponse
from django.db import models, transaction
from django.apps import apps
from django.shortcuts import render
try:
    import simplejson as json
except ImportError:
    import json


# Local Imports
from serializer import serialize_model_objs
from check_access import check_access
from utils import gen_columns


AuthUser = settings.GET_PERMISSION_OBJ()

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


def model_grid(request, app_name, model_name):
    '''
    ' View to return the html that will hold a models chucho.
    '''
    if check_access(request) is None:
        return HttpResponse('User not authenticated.')
    return render(request, 'chucho.html', {'model_name': model_name, 'app_name': app_name})


def api_view(request, app_name, model_name, id=None):
    '''
    ' Router view for the RESTful api portion of Chucho.  All RESTFull requests come through here
    ' and gets routed to the appropriate functions when requests are for managing the data of the models.
    '
    ' Keyword Args:
    '   app_name   - (string) The application the desired model resides in
    '   model_name - (string) The model name to get serialized data from or save to
    '   id         - (string) The id of an object to delete/update for DELETE/PUSH
    '
    ' Returns: HttpResponse with serialized json data
    '''

    user = check_access(request)
    if user is None:
        errors = 'Sorry, but you must be logged in.'
        return HttpResponse(json.dumps({'errors': errors}, indent=4), content_type="application/json")

    print "app_name = {}".format(app_name)
    print "model_name = {}".format(model_name)
    if request.method == "GET":
        return read_source(request, app_name, model_name, user)
    if request.method == "POST":
        return update(request, app_name, model_name, user)
    if request.method == "PUT":
        return update(request, app_name, model_name, user, id)
    if request.method == "DELETE":
        return destroy(request, app_name, model_name, user, id)


def read_source(request, app_name, model_name, user):
    '''
    ' Returns - Dictionary serialized as json:
    '           'data' - paged data from a given model
    '           'page_list' - page buttons html
    '           'errors' - Errors reported to client.
    '
    ' Keyword Args:
    '    app_name     - (string) The application the desired model resides in
    '    model_name   - (string) The model name to get serialized data from
    '    user         - (AuthUser) The authenticated AuthUser object making the request
    '''

    result_info = {}
    get_editable = False
    try:
        jsonData = json.loads(request.GET.get('jsonData'))
    except:
        print "No valid json data found"
    else:
        if 'result_info' in jsonData:
            result_info = jsonData['result_info']
        if 'get_editable' in jsonData:
            get_editable = jsonData['get_editable']

    if 'filter_args' in result_info:
        filter_args = result_info['filter_args']
    else:
        filter_args = None

    kwargs = None
    omni = None
    if filter_args is not None:
        kwargs = {}
        for i in filter_args:
            if i['col'] == 'chucho-omni':
                omni = i['val']
            else:
                cols = i['col'].split('|')
                if len(cols) > 1:
                    keyword = cols[0] + '__' + filter_operators[i['oper']]
                    tmp = {}
                    kwargs[keyword] = tmp

                    for index, c in enumerate(cols[1:], start=1):
                        keyword = c + '__' + filter_operators[i['oper']]
                        if index < len(cols) - 1:
                            tmp[keyword] = {}
                            tmp = tmp[keyword]
                        else:
                            tmp[keyword] = i['val']

                else:
                    keyword = i['col'] + '__' + filter_operators[i['oper']]
                    kwargs[keyword] = i['val']

    cls = apps.get_model(app_name, model_name)

    read_only = False
    try:
        # Only get the objects that can be edited by the user logged in
        if get_editable and cls.objects.can_edit(user):
            objs = cls.objects.get_editable(user, kwargs, omni)
        else:
            objs = cls.objects.get_viewable(user, kwargs, omni)
            read_only = True
    except Exception as e:
        stderr.write('Unknown error occurred in read_source: %s: %s\n' % (type(e), e.message))
        stderr.flush()
        dump = json.dumps({'errors': 'Unknown error occurred in read_source: %s: %s' % (type(e), e.message)}, indent=4)
        return HttpResponse(dump, content_type="application/json")

    extras = {'read_only': read_only}

    # Order the data
    if 'sort_columns' in result_info and result_info['sort_columns'] is not None:
        sign = ""
        sort_arg = result_info['sort_columns']['columnId']
        if not result_info['sort_columns']['sortAsc']:
            sign = "-"

        # Foreign Key relations get ordered normally. They throw an exception otherwise...
        # the update to django 1.10 ment we couldn't use: f, mode, direct, m2m = cls._meta.get_field_by_name(sort_arg)
        # and so instead we now use:
        f = cls._meta.get_field(sort_arg)
        # these are probably unnessisary:
        # model = cls
        # direct = not f.auto_created or f.concrete
        # m2m = f.many_to_many

        if isinstance(f, models.CharField) or isinstance(f, models.TextField):
            objs = objs.extra(select={'lower_'+sort_arg: 'lower('+sort_arg+')'}).order_by(sign+'lower_'+sort_arg)
        else:
            objs = objs.order_by(sign+sort_arg)

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

    return HttpResponse(serialize_model_objs(objs, extras), content_type="application/json")


# @transaction.commit_manually
def update(request, app_name, model_name, user, id=None):
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

    try:
        data = json.loads(request.body)
    except:
        transaction.rollback()
        dump = json.dumps({'errors': 'Error loading json'}, indent=4)
        return HttpResponse(dump, content_type="application/json")

    cls = apps.get_model(app_name, model_name)
    if id is None:
        if not cls.objects.can_edit(user):
            transaction.rollback()
            dump = json.dumps({'errors': 'User %s does not have permission to add to this table.' % str(user)}, indent=4)
            return HttpResponse(dump, content_type="application/json")
        obj = cls()
    else:
        try:
            obj = cls.objects.get_editable_by_pk(user, pk=id)
            if obj is None:
                transaction.rollback()
                dump = json.dumps({'errors': 'User %s does not have permission to edit this object' % str(user)}, indent=4)
                return HttpResponse(dump, content_type="application/json")
        except Exception as e:
            transaction.rollback()
            dump = json.dumps({'errors': 'Cannot load object to save: Exception: ' + e.message}, indent=4)
            return HttpResponse(dump, content_type="application/json")

    try:
        fields = gen_columns(obj)
    except Exception as e:
        transaction.rollback()
        dump = json.dumps({'errors': 'Error generating columns: ' + e.message}, indent=4)
        return HttpResponse(dump, content_type="application/json")

    m2m = []
    try:
        for field in cls._meta.get_fields():
            if field.null:
                continue
            for curfield in data:
                if curfield == field.name and data[curfield] == "":
                    error = "You must fill out the '{}' part of the form ".format(field.name)
                    return HttpResponse(json.dumps({'errors': error}, indent=4), content_type="application/json")

        for field in fields:
            if field['_editable']:

                # save inportant m2m stuff for after object save
                if field['_type'] == 'm2m':
                    m2m.append({
                        'field': field['field'],
                        'model_name': field['model_name'],
                        'app': field['app']
                    })
                    continue

                # Handle empy data
                elif field['field'] in data and data[field['field']] in [None, ''] and field['_type'] != 'password':
                    if field['_type'] in ['text', 'char', 'color']:
                        setattr(obj, field['field'], '')
                    else:
                        setattr(obj, field['field'], None)

                elif field['_type'] == 'foreignkey':
                    rel_cls = apps.get_model(field['app'], field['model_name'])
                    if field['field'] not in data or data[field['field']]['pk'] is None:
                        rel_obj = None
                    else:
                        rel_obj = rel_cls.objects.get(pk=data[field['field']]['pk'])

                    if rel_obj is None or rel_obj.can_view(user):
                        setattr(obj, field['field'], rel_obj)
                    else:
                        transaction.rollback()
                        error = 'Error: You do not have permission to assign this object: %s' % rel_obj
                        return HttpResponse(json.dumps({'errors': error}, indent=4), content_type="application/json")

                elif field['_type'] == 'datetime':
                    dt_obj = None
                    if settings.USE_TZ and data[field['field']] not in (None, u""):
                        dt_obj = make_aware(datetime.utcfromtimestamp(float(data[field['field']])), utc)
                    elif not settings.USE_TZ and data[field['field']] not in (None, u""):
                        aware_dt_obj = make_aware(datetime.utcfromtimestamp(float(data[field['field']])), utc)
                        dt_obj = make_naive(aware_dt_obj, get_current_timezone())

                    setattr(obj, field['field'], dt_obj)

                elif field['_type'] == 'date':
                    dt_obj = datetime.strptime(data[field['field']], settings.D_FORMAT)
                    setattr(obj, field['field'], dt_obj.date())

                elif field['_type'] == 'password':
                    if data[field['field']] not in [None, '']:
                        obj.set_password(data[field['field']])
                else:
                    setattr(obj, field['field'], data[field['field']])
        obj.save()
        try:
            # Get all respective objects for many to many fields and add them in.
            for m in m2m:
                cls = apps.get_model(m['app'], m['model_name'])
                m2m_objs = []
                for m2m_obj in data[m['field']]:
                    rel_obj = cls.objects.get(pk=m2m_obj['pk'])
                    if rel_obj.can_view(user):
                        m2m_objs.append(rel_obj)
                    else:
                        transaction.rollback()
                        error = 'Error: You do not have permission to assign this object: %s' % rel_obj
                        return HttpResponse(json.dumps({'errors': error}, indent=4), content_type="application/json")

                setattr(obj, m['field'], m2m_objs)

        except Exception as e:
            transaction.rollback()
            error = 'Error setting ManyToMany fields: %s: %s' % (type(e), e.message)
            stderr.write(error)
            stderr.flush()
            transaction.rollback()
            return HttpResponse(json.dumps({'errors': error}, indent=4), content_type="application/json")

    except Exception as e:
        transaction.rollback()
        error = 'In ajax update exception: %s: %s\n' % (type(e), e.message)
        stderr.write(error)
        stderr.flush()
        return HttpResponse(json.dumps({'errors': error}, indent=4), content_type="application/json")

    # Run validations
    try:
        obj.full_clean()
    except ValidationError as e:
        transaction.rollback()
        errors = 'ValidationError '
        for field_name, error_messages in e.message_dict.items():
            errors += ' ::Field: %s: Errors: %s ' % (field_name, ','.join(error_messages))

        return HttpResponse(json.dumps({'errors': errors}, indent=4), content_type="application/json")

    try:
        serialized_model = serialize_model_objs([obj.__class__.objects.get(pk=obj.pk)], {'read_only': True})
    except Exception as e:
        transaction.rollback()

        error = 'In ajax update exception: %s: %s\n' % (type(e), e.message)
        stderr.write(error)
        stderr.flush()
        return HttpResponse(json.dumps({'errors': error}, indent=4), content_type="application/json")

    transaction.commit()
    response = HttpResponse(serialized_model, content_type="application/json")
    response.status_code = 201

    return response


# @transaction.commit_manually
def destroy(request, app_name, model_name, user, id=None):
    '''
    ' Receive a model_name and data object via ajax, and remove that item,
    ' returning either a success or error message.
    '''

    cls = apps.get_model(app_name, model_name)
    try:
        obj = cls.objects.get_editable_by_pk(user, id)
        if obj is None:
            transaction.rollback()
            error = "User %s does not have permission to delete this object." % user
            return HttpResponse(json.dumps({'errors': error}, indent=4), content_type="application/json")
    except Exception as e:
        transaction.rollback()
        error = "There was an error for user %s trying to delete this object: %s" % (user, str(e))
        return HttpResponse(json.dumps({'errors': error}, indent=4), content_type="application/json")

    try:
        obj.delete()
    except Exception as e:
        transaction.rollback()
        error = "Unexpected error deleting object: %s: %s" % (type(e), e)
        return HttpResponse(json.dumps({'errors': error}, indent=4), content_type="application/json")

    transaction.commit()
    dump = json.dumps({'success': 'Successfully deleted item with primary key: %s' % id}, indent=4)
    response = HttpResponse(dump, content_type="application/json")
    response.status_code = 201
    return response


def get_columns(request, app_name, model_name):
    '''
    ' Return a HttpResponse with JSON serialized column list for rendering a grid representing a
    ' model.
    '
    ' Keyword args:
    '   app_name   - The application the desired model resides in.
    '   model_name - The name of the model to represent.
    '''

    user = check_access(request)
    if user is None:
        errors = 'User is not logged in properly.'
        return HttpResponse(json.dumps({'errors': errors}, indent=4), content_type="application/json")

    cls = apps.get_model(app_name, model_name)

    filter_depth = None
    if hasattr(cls, 'fk_filter_depth'):
        filter_depth = cls.fk_filter_depth

    return HttpResponse(json.dumps(gen_columns(cls, False, filter_depth), indent=4), content_type="application/json")


def get_filter_operators(request):
    '''
    ' Return HttpResponse with JSON dump of dict of list of select option elements.
    ' This is used by the filter tool in the ui.
    '''

    user = check_access(request)
    if user is None:
        errors = 'User is not logged in properly.'
        return HttpResponse(json.dumps({'errors': errors}, indent=4), content_type="application/json")

    operators = filter_operators.keys()
    operators.sort()
    return HttpResponse(json.dumps(operators, indent=4), content_type="application/json")
