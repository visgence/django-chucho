"""
" chucho/serializer.py
" Contributing Authors:
"    Evan Salazar   (Visgence, Inc)
"    Jeremiah Davis (Visgence, Inc)
"    Bretton Murphy (Visgence, Inc)
"
" (c) 2013 Visgence, Inc.
"""


from django.conf import settings
from calendar import timegm
from django.db import models
from django.utils.timezone import make_aware, is_aware, get_current_timezone
try:
    import simplejson as json
except ImportError:
    import json

AuthUser = settings.GET_PERMISSION_OBJ()


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
                    if not settings.USE_TZ and not is_aware(dt_obj):
                        aware_dt_obj = make_aware(dt_obj, get_current_timezone())
                        obj_dict[f.name] = timegm(aware_dt_obj.utctimetuple())
                    elif settings.USE_TZ and is_aware(dt_obj):
                        obj_dict[f.name] = timegm(dt_obj.utctimetuple())
                    else:
                        error = "There is a datetime that is aware while USE_TZ is false! or vice-versa"
                        return json.dumps({"errors": error})

            elif isinstance(f, models.fields.DateField):
                d_obj = f.value_from_object(obj)
                if d_obj is not None:
                    obj_dict[f.name] = d_obj.strftime(settings.D_FORMAT)

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
