import sys
import os
sys.path.append(os.getcwd() + '\\external')
from websocket import WebSocketHandler, WebSocketSite
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
    self.log("Horizon Server Started")

def response(func):
  def _response(self, data, response_id):
    r = func(self, data, response_id)
    if r != None:
      m = r[0]
      d = r[1]
      i = r[2]
      jd = {}
      if m != None: jd['message'] = m
      if d != None: jd['data'] = d
      if i != None: jd['response_id'] = i
      js = json.dumps(jd)
      self.transport.write(js)
      try:
        self.log('Sending Data: ' + str(js))
      except AttributeError:
        pass
  return _response

class GameHandler(WebSocketHandler, Loggable):
  uuid = 0

  @classmethod
  def get_uuid(cls):
    cls.uuid += 1
    return cls.uuid - 1

  def __init__(self, transport):
    self._uuid = GameHandler.get_uuid()
    Loggable.__init__(self, "GameHandler"+str(self._uuid))
    WebSocketHandler.__init__(self, transport)
    self._keep_alive = task.LoopingCall(self.keep_alive)
    self.log("New Connection")

  def keep_alive(self):
    data = "hi" + datetime.utcnow().isoformat().encode('utf8')
    self.transport.write(data)

  def frameReceived(self, frame):
    self.log("Data Received:"  + str(frame))
    
    try:
      j = json.loads(frame)
      op = j['message']
      fn = 'api_' + str(op)
      data = None
      response_id = None
      try:
        data = j['data']
      except KeyError:
        data = None
      try:
        response_id = j['response_id']
      except KeyError:
        response_id = None

      if hasattr(self, fn):
        getattr(self, fn)(data, response_id)
      else:
        self.log_error("No API for " + str(op))

    except KeyError:
      self.log_error("API error")

  @response
  def api_get_player_id(self, data, response_id):
    return ('get_player_id', self._uuid, response_id)

  def connectionLost(self, reason):
    self.log("Connection Lost: " + str(reason))

if __name__ == "__main__":
  from twisted.internet import reactor
  
  root = RootResource()
  site = WebSocketSite(root)
  site.addHandler('/game', GameHandler)
  reactor.listenTCP(9000, site)
  reactor.run()
