/****************************************************************
 * Horizons
 *
 * (c) 2010 Bobby Richter
 ****************************************************************/

/**********************************************************
 * VARS
 **********************************************************/

/*** FPS ***/
var FPS = 30;
var SPF = 1000/FPS;

/*** canvas & gl ***/
var main_canvas;
var main_canvas_ctx;
var gl;
var main_loop_interval = 0;

/*** stats ***/
var stats_div = null;

/*** scene ***/
var scene;
var octree;

/*** level ***/
var current_level;
var levels = [];

/*** timer ***/
var timerMilliseconds;
var timerSeconds = 0;
var timerLastSeconds = 0;
var frameCounter = 0;

/*** game engine ***/
var game_engine;

/*** game object ***/

/*** physics ***/
var physics_world;

/*** testing ***/
var test_box;
var test_light;
var test_particle_system;
var test_emitter;
var test_body;
var xp = 0;

/*** sockets ***/
var game_socket;

/**********************************************************
 * INIT
 **********************************************************/

/**
 * init_gl
 * Initialize gl & cubicvr
 *
 * @canvas: canvas to initialize for 3d
 **/
function init_gl(canvas) {
  gl = null;
  try {
    gl = canvas.getContext("experimental-webgl");
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  catch(e) {
    console.log(e);
  } //try

  if (!gl) {
    alert("Error: Could not initialize WebGL. Make sure WebGL is enabled in your browser settings.");
    return;
  } //if

  CubicVR.core.init(gl,"core-shader-vs","core-shader-fs");

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clearDepth(1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
} //init_gl

/**
 * init_socket
 * Initialize WebSockets
 **/
function init_socket() {
  game_socket = new GameSocket();
} //init_socket

/**
 * document.ready
 * Entry point
 **/
jQuery(document).ready(function() {
  main_canvas = document.getElementById("main-canvas");
  main_canvas.width = window.innerWidth;
  main_canvas.height = window.innerHeight;
  init_gl(main_canvas);

  init_game_engine();
  init_graphics();
  init_physics();
  init_socket();
  start_main_loop();
  show_stats();
}); //document ready

/**********************************************************
 * STATS
 **********************************************************/

/**
 * show_stats
 * Shows the statistics window.
 **/
function show_stats() {
  if (stats_div === null) {
    jQuery("#main-stats").show();
    stats_div = document.getElementById("main-stats");
  } //if
} //show_stats

/**
 * hide_stats
 * Hides the statistics window.
 **/
function hide_stats() {
  jQuery("#main-stats").hide();
  stats_div = null;
} //hide_stats

/**********************************************************
 * GAME SOCKET
 **********************************************************/
/**
 * GameSocket
 * Send/Receives realtime data to/from server
 **/
function GameSocket() {
  this.current_player_id = -1;
  this.ready = false;
  this.response_id = 0;
  this.response_listeners = [];
  this.socket = new WebSocket("ws://localhost:9000/game");
  var that = this;
  this.socket.onopen = function(e) {that.on_connect(e);};
  this.socket.onmessage = function(e) {that.on_receive(e);};
  this.socket.onclose = function(e) {that.on_close(e);};
} //GameSocket

/**
 * GameSocket::send_message
 * Sends a message to the server and waits for a response if response_listener !== null
 **/
GameSocket.prototype.send_message = function(message, data, response_listener, that) {
  if (response_listener !== undefined && response_listener !== null) {
    this.socket.send(JSON.stringify({message: message, data:data, response_id: this.response_id}));
    this.response_listeners.push({id:this.response_id, listener:response_listener, that: that});
    ++this.response_id;
  }
  else {
    this.socket.send({message: message, data:data});
  } //if
} //GameSocket::send_message

GameSocket.prototype.receive_player_id = function(d) {
  this.current_player_id = d;
} //GameSocket::receive_player_id

GameSocket.prototype.on_connect = function(e) {
  this.ready = true;
  this.send_message('get_player_id', null, this.receive_player_id, this);
} //GameSocket::on_connect

GameSocket.prototype.on_close = function(e) {
  this.ready = false;
} //GameSocket::on_close

GameSocket.prototype.on_receive = function(e) {
  var data = JSON.parse(e.data);
  if (data.response_id !== null && data.response_id !== undefined) {
    var response_listener = null;
    for (var i = 0, l = this.response_listeners.length; i < l; ++i) {
      if (this.response_listeners[i].id === data.response_id) {
        response_listener = this.response_listeners[i];
        this.response_listeners.splice(i, 1);
        break;
      } //if
    } //for
    if (response_listener !== null) {
      if (response_listener.that !== undefined) response_listener.listener.call(response_listener.that, data.data);
      else response_listener.listener(data.data);
    } //if
  } //if
} //GameSocket::on_receive

/**********************************************************
 * GAME ENGINE
 **********************************************************/
/**
 * GameEngine
 * To basically drive the objects in the game
 **/
function GameEngine() {
  this.game_objects = [];
} //GameEngine

GameEngine.add_game_object = function (game_object) {
  this.game_objects.push(game_object);
} //GameEngine::add_game_object

GameEngine.prototype.update = function () {
  var go = this.game_objects;
  for (var i = 0, l = go.length; i < l; ++i) {
    go[i].update();
  } //for
} //GameEngine::update

/**********************************************************
 * WINDOW INPUT COMPONENT
 **********************************************************/

/**
 * WindowInputComponent
 * GameObject Input Component to receive input from window.
 **/
function WindowInputComponent(game_object) {
  this.game_object = game_object;
  this.update = function() {};
  this.action = {
    up:     false,
    down:   false,
    left:   false,
    right:  false,
    fire:   false
  } //action
  this.keys = [];
  for (var i = 0; i < 256; ++i) { this.keys[i] = false; }
  this.mouse = {
    buttons: [false, false],
    position: [0, 0]
  };
  window.addEventListener("MozOrientation", this.moz_orientation_change, false);
  window.addEventListener("orientationchange", this.orientation_change, false);
  window.addEventListener("keydown", this.keydown, false);
  window.addEventListener("keyup", this.keyup, false);
  window.addEventListener("mousedown", this.mousedown, false);
  window.addEventListener("mouseup", this.mouseup, false);
  window.addEventListener("mousemove", this.mousemove, false);
  window.addEventListener("mouseout", this.mouseout, false);
  window.addEventListener("mouseover", this.mouseover, false);
} //WindowInputComponent::Constructor

/**
 * WindowInputComponent::moz_orientation_change
 * Listener for window orientation change on Mozilla browsers
 **/
WindowInputComponent.prototype.moz_orientation_change = function (e) {
  this.action.left = e.x < 0 ? true : false;
  this.action.right = e.x > 0 ? true : false;
  this.action.up = e.y < 0 ? true : false;
  this.action.down = e.y > 0 ? true : false;
} //WindowInputComponent::moz_orientation_change

/**
 * WindowInputComponent::mouseout
 * Listener for window's mouseout event.
 **/
WindowInputComponent.prototype.mouseout = function (e) {
} //WindowInputComponent::mouseout

/**
 * WindowInputComponent::mousemove
 * Listener for window's mousemove event.
 **/
WindowInputComponent.prototype.mousemove = function (e) {
  this.mouse.position[0] = e.pageX;
  this.mouse.position[1] = e.pageY;
} //WindowInputComponent::mousemove

/**
 * WindowInputComponent::mouseover
 * Listener for window's mouseover event.
 **/
WindowInputComponent.prototype.mouseover = function (e) {
} //WindowInputComponent::mouseover

/**
 * WindowInputComponent::mousedown
 * Listener for window's mousedown event.
 **/
WindowInputComponent.prototype.mousedown = function (e) {
} //WindowInputComponent::mousedown

/**
 * WindowInputComponent::mouseup
 * Listener for window's mouseup event.
 **/
WindowInputComponent.prototype.mouseup = function (e) {
} //WindowInputComponent::mousedown

/**
 * WindowInputComponent::keydown
 * Listener for window's keydown event.
 **/
WindowInputComponent.prototype.keydown = function (e) {
  this.keys[e.keyCode] = true;
  switch (e.keyCode) {
    case 37: this.action.left = false; break;
    case 38: this.action.up = false; break;
    case 39: this.action.right = false; break;
    case 40: this.action.down = false; break;
    default: break;
  } //switch
} //WindowInputComponent::keydown

/**
 * WindowInputComponent::keyup
 * Listener for window's keyup event.
 **/
WindowInputComponent.prototype.keyup = function (e) {
  this.keys[e.keyCode] = false;
  switch (e.keyCode) {
    case 37: this.action.left = true; break;
    case 38: this.action.up = true; break;
    case 39: this.action.right = true; break;
    case 40: this.action.down = true; break;
    default: break;
  } //switch
} //WindowInputComponent::keyup

/**
 * PlayerPhysicsComponent
 * GameObject Physics component for the player.
 **/
function PlayerPhysicsComponent(game_object) {
  this.game_object = game_object;
} //PlayerPhysicsComponent

PlayerPhysicsComponent.prototype.update = function() {
  var gc = this.game_object;
  var ic = this.gc.input_component;
  if (ic !== null) {
    if (ic.action.up === true) {
      gc.position[1] -=1;
    } //if
    if (ic.action.down === true) {
      gc.position[1] +=1;
    } //if
    if (ic.action.left === true) {
      gc.position[0] -= 1;
    } //if
    if (ic.action.right === true) {
      gc.position[0] += 1;
    } //if
  } //if
} //PlayerPhysicsComponent::update

/**********************************************************
 * PLAYER LOGIC COMPONENT
 **********************************************************/
/**
 * PlayerLogicComponent
 * GameObject Logic Component for the player.
 **/
function PlayerLogicComponent(game_object) {
  this.game_object = game_object;
} //PlayerLogicComponent

/**
 * PlayerLogicComponent::update
 * Advances logic for this frame.
 **/
PlayerLogicComponent.prototype.update = function () {
} //PlayerLogicComponent::update

/**********************************************************
 * GAME OBJECT
 **********************************************************/
/**
 * GameObject
 * Encompasses an object in the game that may be controlled
 * by physics or input, and have sound, graphics or logic.
 **/
function GameObject() {
  this.position = [0,0,0];
  this.velocity = [0,0,0];
  this.rotation = [0,0,0];
  this.acceleration = [0,0,0];
  this.sleep = false;

  this.sound_component = null;
  this.physics_component = null;
  this.graphics_component = null;
  this.input_component = null;
  this.logic_component = null;
} //GameObject::Constructor

/**
 * GameObject::update
 * Advances all components for this frame
 **/
GameObject.prototype.update = function() {
  // update input component
  if (this.input_component !== null) {
    this.input_component.update();
  } //if

  // update logic component
  if (this.logic_component !== null) {
    this.logic_component.update();
  } //if

  // update physics component
  if (this.physics_component !== null) {
    this.physics_component.update();
  } //if

  // update graphics component
  if (this.graphics_component !== null) {
    this.graphics_component.update();
  } //if
} //GameObject::update

/**********************************************************
 * LEVEL
 **********************************************************/
/**
 * Level
 * Data for a level.
 **/
function Level(level_number) {
  this.id = 0;
} //Level::Constructor

levels.push(new Level({
  terrain: [],
  objects: []
}));

/**
 * load_level
 * Prepares a level for use
 *
 * @level_num: id of level to load
 **/
function load_level(level_num) {
  if (level_num === 0) {
  } //if
} //load_level

/**********************************************************
 * RENDER & SCENE
 **********************************************************/
/**
 * start_main_loop
 * Starts the main loop
 **/
function start_main_loop() {
  if (main_loop_interval === 0) {
    main_loop_interval = 1;
    main_loop();
  } //if
} //start_main_loop

/**
 * stop_main_loop
 * Stops the main loop indirectly
 **/
function stop_main_loop() {
  main_loop_interval = 0;
} //stop_main_loop

/**
 * init_graphics
 * Prepares a CubicVR for use. Initializes the viewport, camera and initial sceneObjects.
 **/
function init_graphics() {
  octree = new OcTree(4000, 8);
  scene = new CubicVR.scene(main_canvas.width, main_canvas.height, 40, 0.1, 300, octree);
  scene.setSkyBox(new CubicVR.skyBox("content/skybox/clouds.jpg"));
  scene.camera.position = [0, 0, 0];
  scene.camera.target = [0, 0, 1];
  scene.camera.setFOV(40);
  scene.camera.setDimensions(main_canvas.width, main_canvas.height);

  /** for testing **/
  var box_material = new CubicVR.material("test");
  box_material.color = [1, 0, 0];
  var box_object = new CubicVR.object();
  CubicVR.genBoxObject(box_object, .5, box_material);
  box_object.calcNormals();
  box_object.triangulateQuads();
  box_object.compile();
  var scene_object = new CubicVR.sceneObject(box_object);
  scene_object.position = [0, 0, 10];
  scene.bindSceneObject(scene_object);
  test_box = scene_object;
  var light = new cubicvr_light(LIGHT_TYPE_POINT);
  light.position = [0, 0, 0];
  light.distance = 200.0;
  light.intensity = 3.0;
  scene.bindLight(light);
  test_light = light;

  test_particle_system = new cubicvr_particleSystem(10000,true,new CubicVR.texture("content/particles/flare.png"),640,640,true);
  test_emitter = new cubicvr_particleEmitter({ 
                              name:"test",
                              position:[0, 0, 0],
                              emission_rate:.01, 
                              emission_size:20, 
                              max_particles:5000,
                              max_visible_particles:5000,
                              alpha: true,
                              p_base_velocity: [0, 0, 0],
                              p_velocity_variance: [2, 2, 2],
                              p_base_accel: [0, 0, 0],
                              p_life:0.5, 
                              p_life_variance:0.1, 
                              p_base_color:[.5,.5,.5], 
                              p_color_variance:[1,1,1],
                              p_texture:new CubicVR.texture("content/particles/flare.png")});
   test_particle_system.addEmitter(test_emitter);

} //init_graphics

/**
 * init_game_engine
 **/
function init_game_engine() {
  game_engine = new GameEngine();
} //init_game_engine

/**
 * init_physics
 **/
function init_physics() {
  var world_aabb = new b2AABB();
  world_aabb.minVertex.Set(-1000, -1000);
  world_aabb.maxVertex.Set(1000, 1000);

  var gravity = new b2Vec2(0, -3.0);
  var rest_sleep = true;
  physics_world = new b2World(world_aabb, gravity, rest_sleep);

  var sd = new b2BoxDef();
	var bd = new b2BodyDef();
	bd.AddShape(sd);
	sd.density = 1.0;
	sd.friction = 0.5;
  sd.radius = 1.0;
	sd.extents.Set(1, 1);

  bd.position.Set(0, 1);
	test_body = physics_world.CreateBody(bd);

  var groundSd = new b2BoxDef();
	groundSd.extents.Set(1000, 1);
	groundSd.restitution = 0.2;
	var groundBd = new b2BodyDef();
	groundBd.AddShape(groundSd);
	groundBd.position.Set(-500, -2);
	physics_world.CreateBody(groundBd)

} //init_physics

/**
 * run_timer
 * Advances the game timer.
 **/
function run_timer()
{
  if (!timerMilliseconds) {
    timerMilliseconds = (new Date()).getTime();
    return;
  } //if
  frameCounter++;
  var newTimerMilliseconds = (new Date()).getTime();
  timerLastSeconds = (newTimerMilliseconds-timerMilliseconds)/1000.0;
  if (timerLastSeconds > (1/10)) timerLastSeconds = (1/10);
  timerSeconds += timerLastSeconds;
  timerMilliseconds = newTimerMilliseconds;
} //run_timer

/**
 * main_loop 
 * Main Loop
 **/
function main_loop() {
  xp += 0.01;
  var time_before_loop = new Date();

  /** begin engine **/
  game_engine.update();
  /** end engine **/

  /** begin physics **/
  var time_step = 1.0/60;
  var iteration = 1;
  physics_world.Step(time_step, iteration);
  test_box.position = [test_body.GetOriginPosition().x, test_body.GetOriginPosition().y, 10];
  /** end physics **/

  /** begin render **/
  run_timer();
  
  //for testing
  var c = CubicVR_Materials[test_box.obj.currentMaterial].color;
  c[0] = (c[0] + xp/100);
  c[1] = (c[1] + xp/200);
  c[2] = (c[2] + xp/300);
  if (c[0] > 1) c[0] = 0;
  if (c[1] > 1) c[1] = 0;
  if (c[2] > 1) c[2] = 0;
  CubicVR_Materials[test_box.obj.currentMaterial].color = c;
  test_box.rotation = [xp*300, xp*100, xp*200];
  test_light.position = [Math.sin(xp*10)*5, 0, 10 + Math.cos(xp*10)*5];

  test_particle_system.update(timerSeconds);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  scene.camera.target = [0, 0, 1];
  scene.camera.position = [0, 0, 0];
  scene.render();

  test_emitter.position = [test_light.position[0], test_light.position[1], test_light.position[2]];
  var mvMatrix = CubicVR.lookat(30.0, 30.0, 30.0, 0, 30, 0, 0, 1, 0);
	var pMatrix = CubicVR.perspective(40, 1.0, 0.1, 1000.0); 
  test_particle_system.draw(scene.camera.mvMatrix, scene.camera.pMatrix, timerSeconds);
  /** end render **/

  /*** statistics ***/
  var time_after_loop = new Date();
  var elapsed_loop_time = time_after_loop.getTime() - time_before_loop.getTime();
  if (main_loop_interval !== 0) {
    if (elapsed_loop_time < SPF) {
      setTimeout(main_loop, SPF)
    }
    else {
      setTimeout(main_loop, 0);
    } //if
  } //if

  /** stats **/
  if (stats_div !== null) {
    var s = "FPS: " + Math.round(10/elapsed_loop_time) + " | CANVAS: (" + main_canvas.width + ", " + main_canvas.height + ")";
    if (game_socket.ready) s += "| Connected: " + game_socket.current_player_id;
    else s += "| Disconnected";
    stats_div.innerHTML = s;
  } //if
} //main_loop
