/*
Copyright (c) 2012-2014 Chris Pettitt

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

module.exports = {
  graphlib: require("@dagrejs/graphlib"),

  layout: require("./lib/layout"),
  debug: require("./lib/debug"),
  util: {
    time: require("./lib/util").time,
    notime: require("./lib/util").notime
  },
  version: require("./lib/version")
};

var graphlib = require("@dagrejs/graphlib")
var g = new graphlib.Graph();
g.setNode("a");
console.log(g.hasNode("a"));

var gd = new graphlib.Graph({directed: true}).setGraph({rankdir:"LR"});
gd.setDefaultEdgeLabel(function(){ return {width:50};});
// оно реверсится... из-за LR, width = height, height = width.
gd.setNode("1", {label: "Su", width: 1000, height: 0, in: 2, out: 4}); // название портов всегда есть
gd.setNode("2", {label: "I1", width: 30, height: 0});
gd.setNode("3", {label: "I2", width: 30, height: 0});
gd.setNode("4", {label: "R", width: 30, height: 40});
gd.setNode("5", {label: "D", width: 30, height: 40});

gd.setEdge("1", "2");
gd.setEdge("1", "3");
gd.setEdge("3", "4");
gd.setEdge("2", "4");
gd.setEdge("3", "5");
gd.setEdge("1", "5");
gd.setEdge("2", "1");

console.log({edges: gd.edges()})

// normalize - это то что создает фиктивные узлы

var layout = require("./lib/layout")
layout(gd, {minlen:0, ranker:"longest-path"});
gd.edges().forEach(function(e) {
  var points = [];
  gd.edge(e).points.forEach((p)=>{
    points.push(p.x, p.y);
  });
  console.log(points)
 console.log("Edge " + e.v + " -> " + e.w + ": " + JSON.stringify(gd.edge(e)));
});
gd.nodes().forEach(function(v) {
  console.log("Node " + v + ": " + JSON.stringify(gd.node(v)));
});
