"use strict";

let graphlib = require("@dagrejs/graphlib");
let util = require("../util");
let positionX = require("./bk").positionX;

module.exports = position;

function position(g) {
  g = util.asNonCompoundGraph(g);
  positionY(g);
  Object.entries(positionX(g)).forEach(([v, x]) => g.node(v).x = x);
}

function positionY(g) {
  let layering = util.buildLayerMatrix(g);
  // console.log({layer_matrix: layering});
  let rankSep = g.graph().ranksep;
  let prevY = 0;
  layering.forEach(layer => {
    const maxHeight = layer.reduce((acc, v) => {
      const height = g.node(v).height;
      if (acc > height) {
        return acc;
      } else {
        return height;
      }
    }, 0);
    layer.forEach(v => g.node(v).y = prevY + maxHeight / 2);
    // in:, out:
    layer.forEach((v) => {
      let node = g.node(v);
      function poses_h(outs, height)  {
        var result = []
        const segment_len = height / (outs + 1);
        for(let i = 1; i <= outs; ++i ){
          result.push(segment_len * i);
        }
        return result;
      }
      let h_ = g.node(v).height
      if(node.hasOwnProperty("out")){
        node.out_pos = poses_h(g.node(v).out, h_);

      }
      if(node.hasOwnProperty("in")){
        node.in_pos = poses_h(g.node(v).in,h_ );
      }
    })
    
    prevY += maxHeight + rankSep;
  });
}

