from distutils.core import setup, find_packages
setup(name='chucho',
      version='1.0',
      py_modules=['chucho','slickGrid'],
      packages=find_packages(),
      install_requires = ['slickGrid @ git+https://github.com/mleibman/SlickGrid.git'],
      )
