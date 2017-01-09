#Django-Chucho

An Ajax CRUD system for Django models based on Knockout and JQuery UI


##Dependencies

- Jquery 1.10.1  
- Jquery-tmpl 1.0.0pre  
- Jquery-ui 1.10.1  
- jquery-ui-timepicker-addon  
- Knockout 2.2.1  
- spin.js  


##Installation

The `required files` from chucho that must be loaded are the following:

chucho/static/js/chucho.grid.js  
chucho/static/js/chucho.js  
chucho/static/css/grid.css  

While it is not strictly necessary it is recommended that you also use the Twitter Bootstrap css found at:  
http://twitter.github.io/bootstrap/index.html

**NOTE:** There is a specific order which should be obeyed when importing the needed js files.

- Jquery  
- Jquery.tmpl  
- Knockout  
- chucho/static/js/chucho.grid.js  
- chucho/static/js/chucho.js  

1) Install Chucho into your project as a git submodule.

    git submodule add git://github.com/visgence/django-chucho.git <your project root>/chucho

2) Configure settings file to use with Chucho.
  
Add the following to settings.
    
```python
D_FORMAT = "%m/%d/%Y"

def GET_PERMISSION_OBJ(): 
    '''
    ' This function should be modified to return the object that is used to verify permissions in the
    ' object managers.  This is required for the chucho interface.
    '''
    from django.contrib.auth import get_user_model
    return get_user_model()

...

INSTALLED_APPS = (
    ...
    'chucho',
    ...
)

...

```

3) Add Chucho url to root urls.py

Add this url to your url patterns inside the root url.py of your project  
```python
url(r'^chucho/', include('chucho.urls')),
```


5) Import ChuchoManager and ChuchoUserManager

For the models that you wish to manage using Chucho, we have provided a default base manager class for your convenience.
You can import ChuchoManger from chucho.models and either make it the manager of any of your models or if you already have a
manager for your model that you've written yourself just make sure it inherits from ChuchoManger.

The ChuchoManager class provides default implementations of the manager methods necessary for Chucho's permission checking
and filtering.  To implement your own custom permissions or filters, you may overwrite any of the provided manager methods.
Please see Overriding Managers section for details.

If you happen to have a User model that overrides Django's auth_user model then you can use Chucho with that model too.
Just import ChuchoUserManager from chucho.models and follow the same instructions as before for the regular ChuchoManager.


##Usage

To use chucho you first need to provide a hook by adding a div element with the id "chuchoGridContainer".
Second you need to make a call to loadModelGrid() and pass it the django app your model resides in and the models name 
all lower case.

Example:
```python
loadModelGrid('people_app', 'person_model'); 
```

##Overriding Managers

< Soon To Be Written>


##Sponsored by
    
Visgence, Inc. 
www.visgence.com


##License

This work is licensed under the Creative Commons Attribution-ShareAlike 3.0 United States License. To view a copy of 
this license, visit http://creativecommons.org/licenses/by-sa/3.0/us/ or send a letter to Creative Commons, 444 Castro 
Street, Suite 900, Mountain View, California, 94041, USA.

