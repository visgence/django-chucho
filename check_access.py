"""
" chucho/check_access.py
" Contributing Authors:
"    Jeremiah Davis (Visgence, Inc)
"
" (c) 2013 Visgence, Inc.
"""

import json

def check_access(request):
    '''
    ' Make sure the user is properly logged in. If so, then return the user.  If not, return None
    '''
    if request.user.is_authenticated():
        if request.user.is_active:
            return request.user
    return None
