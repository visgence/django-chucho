from django.db import models
from django.db.models import Q
import re

class ChuchoManager(models.Manager):
    '''
    ' Custom manager for chucho.  This manager is meant to be inherited by model managers
    '   in user apps.  It provides a search method that can be used by chucho omni filter.
    '   In the future, this may be expanded to include default methods for all necessary
    '   chucho manager methods.
    '''
    def search(self, search_str, operator=None, column=None):
        print 'Searching'
        q_list = []
        q_list += self.search_all(search_str, operator, column)

        q_all = None
        for q in q_list:
            if q_all is None:
                q_all = q
            else:
                q_all |= q
        
        return self.filter(q_all)

    def search_all(self, search_str, operator, column):
        # get an object of type to get the search fields
        o = self.all()[0]
        try:
            fields = o.search_fields
        except AttributeError:
            fields = [f.name for f in o._meta.fields]
        q_list = []
        op = '__icontains'
        print fields
        for f in fields:
            f_attr = getattr(o, f)
            print f
            if isinstance(f_attr, models.Model):
                print 'Doing foreign key'
                # Is a foreign key
                foreign_objs = f_attr.__class__.objects.search(search_str, operator, column)
                q_list.append(Q(**{f + '__in': foreign_objs}))
            else:
                q_list.append(Q(**{f + op: search_str}))

        return q_list

class ChuchoUserManager(ChuchoManager):
    '''
    ' Custom manager for chucho.  This manager is meant to be inherited by model managers
    '   in user apps.  It provides a search method that can be used by chucho omni filter.
    '   In the future, this may be expanded to include default methods for all necessary
    '   chucho manager methods.
    '''
    def search(self, search_str, operator=None, column=None):

        # Regexes to trigger different kinds of searches.
        pattern_name1 = r'^\s*([a-z]+)\s+([a-z]+)\s*$'
        pattern_name2 = r'^\s*([a-z]+),\s*([a-z]+)\s*$'
        pattern_username = r'^\s*(\w+)\s*$'
        pattern_email = r'^\s*(\w+@\w+\.\w+)\s*$'
        result = self.none()
        
        q_list = []
        m = re.match(pattern_name1, search_str, re.I)
        if m is not None:
            q_list += self.search_name(m.group(1), m.group(2))

        m = re.match(pattern_name2, search_str, re.I)
        if m is not None:
            q_list += self.search_name(m.group(2), m.group(1))

        m = re.match(pattern_username, search_str, re.I)
        if m is not None:
            q_list += self.search_username(m.group(1))
            q_list += self.search_name_part(m.group(1))

        q_all = None
        for q in q_list:
            if q_all is None:
                q_all = q
            else:
                q_all |= q

        return self.filter(q_all)

    def search_name(self, first, last):
        op = '__icontains'
        filter_args = {
            name_fields['first']  + op: first,
            name_fields['last'] + op: last
            }
        return [Q(**filter_args)]

    def search_username(self, s):
        op = '__icontains'
        q_list = []
        try:
            o = self.all()[0]
        except Exception as e:
            print 'No objects exist for this model'
            return q_list
        try:
            username = o.USERNAME_FIELD
        except AttributeError:
            print 'No USERNAME_FIELD defined, trying to use "username".'
            try:
                u = o.username
                username = 'username'
            except Exception as e:
                print 'Do not know what username field to use, not searching on username.'
                return q_list
        
        q_list.append(Q(**{username + op: s}))
        return q_list

    def search_name_part(self, s):
        op = '__icontains'
        q_list = []
        q_list.append(Q(**{name_fields['first'] + op: s}))
        q_list.append(Q(**{name_fields['last'] + op: s}))

        return q_list
        
# TODO: Make this more general, and overwriteable.
name_fields = {
    'first': 'first_name',
    'last': 'last_name'
    }
