/*** FPS ***/
var FPS = 30;
var SPF = 1000/FPS;

/*** canvas & gl ***/
var main_canvas;
var main_canvas_ctx;
var gl;
var render_loop_interval = 0;

/*** stats ***/
var stats_div = null;

/*** scene ***/
var scene;
var octree;

/*** init gl ***/
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

/*** document ready ***/
$(document).ready(function() {
  main_canvas = document.getElementById("main-canvas");
  main_canvas.width = window.innerWidth;
  main_canvas.height = window.innerHeight;
  init_gl(main_canvas);

  setup_scene();
  start_render_loop();
  show_stats();
}); //document ready

/*** show_stats ***/
function show_stats() {
  if (stats_div === null) {
    $("#main-stats").show();
    stats_div = document.getElementById("main-stats");
  } //if
} //show_stats

/*** hide_stats ***/
function hide_stats() {
  $("#main-stats").hide();
  stats_div = null;
} //hide_stats

/*** start_render_loop ***/
function start_render_loop() {
  if (render_loop_interval === 0) {
    render_loop_interval = 1;
    render();
  } //if
} //start_render_loop

/*** stop_render_loop ***/
function stop_render_loop() {
  render_loop_interval = 0;
} //stop_render_loop

/*** setup_scene ***/
var test_box;
var test_light;
var test_particle_system;
var test_emitter;
function setup_scene() {
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
                              emission_size:200, 
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

} //setup_scene

/*** run timer ***/
var timerMilliseconds;
var timerSeconds = 0;
var timerLastSeconds = 0;
var frameCounter = 0;
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

/*** render ***/
var xp = 0;
function render() {
  xp += 0.01;
  var time_before_render = new Date();

  /** begin render **/
  run_timer();
  
  //for testing
  var c = CubicVR_Materials[test_box.obj.currentMaterial].color;
  c[0] = (c[0] + xp);
  c[1] = (c[1] + xp/2);
  c[2] = (c[2] + xp/3);
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

  var time_after_render = new Date();
  var elapsed_render_time = time_after_render.getTime() - time_before_render.getTime();
  if (render_loop_interval !== 0) {
    if (elapsed_render_time < SPF) {
      setTimeout(render, SPF)
      //console.log(elapsed_render_time, "SPF", SPF);
    }
    else {
      setTimeout(render, 0);
      //console.log(elapsed_render_time, "now", 0);
    } //if
  } //if

  /** stats **/
  if (stats_div !== null) {
    stats_div.innerHTML = "FPS: " + Math.round(1000/elapsed_render_time) + " | CANVAS: (" + main_canvas.width + ", " + main_canvas.height + ")";
  } //if
} //render
