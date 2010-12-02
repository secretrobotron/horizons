import sys
import os
sys.path.append(os.getcwd() + '\\external')
from twisted.web.resource import Resource
from twisted.web.server import Site
from twisted.internet import task
from datetime import datetime
import json

class Loggable:
  def __init__(self, name):
    self._name = name

  def log_debug(self, msg):
    print "[" + self._name + "] " + "DEBUG: " + str(msg)

  def log_error(self, msg):
    print "[" + self._name + "] " + "ERROR: " + str(msg)

  def log(self, msg):
    print "[" + self._name + "] " + str(msg)

class RootResource(Resource, Loggable):
  def __init__(self):
    Loggable.__init__(self, "Root")
    Resource.__init__(self)
    self.log("Linecraft Server Started")

class StoreHandler(Resource, Loggable):

  def __init__(self):
    Loggable.__init__(self, "StoreHandler")
    Resource.__init__(self)
    self.log("StoreHandler Initialized")

  def render(self, request):
    self.log("Data Received")
    try:
      self.log("Num Arguments: " + str(len(request.args)))
      data = request.args['data'][0]
      name = request.args['name'][0]
      self.log("Found Data. Storing as '" + name + "'.")
      f = open('store/' + name, "w")
      f.write(data)
      f.close();
      self.log("Done.")
      return "Success"
    except KeyError:
      self.log_error("Incorrect Arguments")
      return "Error"

if __name__ == "__main__":
  from twisted.internet import reactor
  
  root = RootResource()
  root.putChild('store', StoreHandler())
  site = Site(root)
  try:
    reactor.listenTCP(8888, site)
    reactor.run()
  except KeyboardInterrupt:
    print "Done"

