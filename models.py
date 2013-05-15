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

        # Regexes to trigger different kinds of searches.
        pattern_name1 = r'^\s*([a-z]+)\s+([a-z]+)\s*$'
        pattern_name2 = r'^\s*([a-z]+),\s*([a-z]+)\s*$'

        result = self.none()

        result |= self.search_all(search_str)
        
        return result

    def search_all(self, search_str):
        # get an object of type to get the search fields
        o = self.all()[0]
        try:
            fields = o.search_fields
        except AttributeError:
            fields = [f.name for f in o._meta.fields]
        q = None
        op = '__icontains'
        for f in fields:
            if q is None:
                q = Q(**{f + op: search_str})
            else:
                q |= Q(**{f + op: search_str})

        return self.filter(q)

class ChuchoUserManager(models.Manager):
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
        print 'Searching'
        m = re.match(pattern_name1, search_str, re.I)
        if m is not None:
            print "Match name1"
            result |= self.search_name(m.group(1), m.group(2))

        m = re.match(pattern_name2, search_str, re.I)
        if m is not None:
            print "Match name2"
            result |= self.search_name(m.group(2), m.group(1))

        m = re.match(pattern_username, search_str, re.I)
        if m is not None:
            print m.group(1)
            result |= self.search_username(m.group(1))

        return result

    def search_name(self, first, last):
        filter_args = {
            name_fields['first']  + '__icontains': first,
            name_fields['last'] + '__icontains': last
            }
        return self.filter(**filter_args)

    def search_username(self, s):
        o = self.all()[0]
        try:
            username = o.USERNAME_FIELD
        except AttributeError:
            username = None
        result = self.none()
        try:
            result |= self.filter(username__icontains=s)
        except TypeError:
            pass

        result |= self.filter(Q(first_name__icontains=s) | Q(last_name__icontains=s))
        return result
        
        
name_fields = {
    'first': 'first_name',
    'last': 'last_name'
    }
