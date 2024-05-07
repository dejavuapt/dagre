"use strict";

let acyclic = require("./acyclic");
let normalize = require("./normalize");
let rank = require("./rank");
let normalizeRanks = require("./util").normalizeRanks;
let parentDummyChains = require("./parent-dummy-chains");
let removeEmptyRanks = require("./util").removeEmptyRanks;
let nestingGraph = require("./nesting-graph");
let addBorderSegments = require("./add-border-segments");
let coordinateSystem = require("./coordinate-system");
let order = require("./order");
let position = require("./position");
let util = require("./util");
let tLayer = require("./layout-epid-graph");
let Graph = require("@dagrejs/graphlib").Graph;
let _json = require("@dagrejs/graphlib").json;

module.exports = layout;

function layout(g, opts) {
  let time = opts && opts.debugTiming ? util.time : util.notime;
  time("layout", () => {
    let layoutGraph =
      time("  buildLayoutGraph", () => buildLayoutGraph(g));
    time("  runLayout",        () => runLayout(layoutGraph, time));
    time("  updateInputGraph", () => updateInputGraph(g, layoutGraph));
  });
}

function runLayout(g, time) {
  time("    makeSpaceForEdgeLabels", () => makeSpaceForEdgeLabels(g));
  time("    removeSelfEdges",        () => removeSelfEdges(g));
  time("    acyclic",                () => acyclic.run(g));
  time("    nestingGraph.run",       () => nestingGraph.run(g));
  time("    rank",                   () => rank(util.asNonCompoundGraph(g)));
  time("    injectEdgeLabelProxies", () => injectEdgeLabelProxies(g));
  time("    removeEmptyRanks",       () => removeEmptyRanks(g));
  time("    nestingGraph.cleanup",   () => nestingGraph.cleanup(g));
  time("    normalizeRanks",         () => normalizeRanks(g)); // add offste of ports
  // time("    logging",                () => logCurrentGraphState(g));
  time("    assignRankMinMax",       () => assignRankMinMax(g));
  time("    removeEdgeLabelProxies", () => removeEdgeLabelProxies(g));
  time("    normalize.run",          () => normalize.run(g));
  time("    parentDummyChains",      () => parentDummyChains(g));
  time("    addBorderSegments",      () => addBorderSegments(g));
  time("    order",                  () => order(g));
  // time("    logging",                () => logCurrentGraphState(g));
  time("    insertSelfEdges",        () => insertSelfEdges(g));
  time("    adjustCoordinateSystem", () => coordinateSystem.adjust(g));
  // time("    logging",                () => logCurrentGraphState(g));
  time("    position",               () => position(g));
  // time("    Tview",                  () => sumLayerWeight(g));
  // time("    logging",                () => logCurrentGraphState(g));
  time("    positionSelfEdges",      () => positionSelfEdges(g));
  time("    removeBorderNodes",      () => removeBorderNodes(g));
  time("    normalize.undo",         () => normalize.undo(g));
  // time("    logging",                () => logCurrentGraphState(g));
  time("    fixupEdgeLabelCoords",   () => fixupEdgeLabelCoords(g));
  time("    undoCoordinateSystem",   () => coordinateSystem.undo(g));
  time("    translateGraph",         () => translateGraph(g));
  // time("    logging",                () => logCurrentGraphState(g));
  time("    assignNodeIntersects",   () => assignNodeIntersects(g));//после этого выдаются координаты всем узлам
  // time("    Tview",                  () => assignNodeIntersectsTView(g));
  time("    logging",                () => logCurrentGraphState(g, "own assign"));
  time("    reversePoints",          () => reversePointsForReversedEdges(g));
  time("    acyclic.undo",           () => acyclic.undo(g));
}

function logCurrentGraphState(g, logging_info){
  console.log("----------------------------------- %s", logging_info.toUpperCase())
  // console.dir(_json.write(g))
  // g.edges().forEach((v) => {
  //   console.log("EDGE" + v.v + " -> " + v.w + " | DATA: " + JSON.stringify(g.edge(v)));
  // })
  // g.nodes().forEach((v) => {
  //   console.log("NODE " + v + " | DATA: " + JSON.stringify(g.node(v)));
  // })
  tLayer(g, {offset: 10});

  console.log("----------------------------------- END %s", logging_info.toUpperCase())
}
/*
 * Copies final layout information from the layout graph back to the input
 * graph. This process only copies whitelisted attributes from the layout graph
 * to the input graph, so it serves as a good place to determine what
 * attributes can influence layout.
 */
function updateInputGraph(inputGraph, layoutGraph) {
  inputGraph.nodes().forEach(v => {
    let inputLabel = inputGraph.node(v);
    let layoutLabel = layoutGraph.node(v);

    if (inputLabel) {
      inputLabel.x = layoutLabel.x;
      inputLabel.y = layoutLabel.y;
      inputLabel.rank = layoutLabel.rank;

      if (layoutGraph.children(v).length) {
        inputLabel.width = layoutLabel.width;
        inputLabel.height = layoutLabel.height;
      }
    }
  });

  inputGraph.edges().forEach(e => {
    let inputLabel = inputGraph.edge(e);
    let layoutLabel = layoutGraph.edge(e);

    inputLabel.points = layoutLabel.points;
    if (layoutLabel.hasOwnProperty("x")) {
      inputLabel.x = layoutLabel.x;
      inputLabel.y = layoutLabel.y;
    }
  });

  inputGraph.graph().width = layoutGraph.graph().width;
  inputGraph.graph().height = layoutGraph.graph().height;
}

let graphNumAttrs = ["nodesep", "edgesep", "ranksep", "marginx", "marginy"];
let graphDefaults = { ranksep: 50, edgesep: 20, nodesep: 50, rankdir: "tb" };
let graphAttrs = ["acyclicer", "ranker", "rankdir", "align"];
let nodeNumAttrs = ["width", "height", "in", "out"];
let nodeDefaults = { width: 0, height: 0, in: 0, out: 0 }; // add in, out
let edgeNumAttrs = ["minlen", "weight", "width", "height", "labeloffset"];
let edgeDefaults = {
  minlen: 1, weight: 1, width: 0, height: 0,
  labeloffset: 10, labelpos: "r"
};
let edgeAttrs = ["labelpos"];

/*
 * Constructs a new graph from the input graph, which can be used for layout.
 * This process copies only whitelisted attributes from the input graph to the
 * layout graph. Thus this function serves as a good place to determine what
 * attributes can influence layout.
 */
function buildLayoutGraph(inputGraph) {
  let g = new Graph({ multigraph: true, compound: true });
  let graph = canonicalize(inputGraph.graph());

  g.setGraph(Object.assign({},
    graphDefaults,
    selectNumberAttrs(graph, graphNumAttrs),
    util.pick(graph, graphAttrs)));

  inputGraph.nodes().forEach(v => {
    let node = canonicalize(inputGraph.node(v));
    const newNode = selectNumberAttrs(node, nodeNumAttrs);
    Object.keys(nodeDefaults).forEach(k => {
      if (newNode[k] === undefined) {
        newNode[k] = nodeDefaults[k];
      }
    });

    g.setNode(v, newNode);
    g.setParent(v, inputGraph.parent(v));
  });

  inputGraph.edges().forEach(e => {
    let edge = canonicalize(inputGraph.edge(e));
    g.setEdge(e, Object.assign({},
      edgeDefaults,
      selectNumberAttrs(edge, edgeNumAttrs),
      util.pick(edge, edgeAttrs)));
  });

  return g;
}

/*
 * This idea comes from the Gansner paper: to account for edge labels in our
 * layout we split each rank in half by doubling minlen and halving ranksep.
 * Then we can place labels at these mid-points between nodes.
 *
 * We also add some minimal padding to the width to push the label for the edge
 * away from the edge itself a bit.
 */
function makeSpaceForEdgeLabels(g) {
  let graph = g.graph();
  graph.ranksep /= 2;
  g.edges().forEach(e => {
    let edge = g.edge(e);
    edge.minlen *= 2;
    if (edge.labelpos.toLowerCase() !== "c") {
      if (graph.rankdir === "TB" || graph.rankdir === "BT") {
        edge.width += edge.labeloffset;
      } else {
        edge.height += edge.labeloffset;
      }
    }
  });
}

/*
 * Creates temporary dummy nodes that capture the rank in which each edge's
 * label is going to, if it has one of non-zero width and height. We do this
 * so that we can safely remove empty ranks while preserving balance for the
 * label's position.
 */
function injectEdgeLabelProxies(g) {
  g.edges().forEach(e => {
    let edge = g.edge(e);
    if (edge.width && edge.height) {
      let v = g.node(e.v);
      let w = g.node(e.w);
      let label = { rank: (w.rank - v.rank) / 2 + v.rank, e: e };
      util.addDummyNode(g, "edge-proxy", label, "_ep");
    }
  });
}

function assignRankMinMax(g) {
  let maxRank = 0;
  g.nodes().forEach(v => {
    let node = g.node(v);
    if (node.borderTop) {
      node.minRank = g.node(node.borderTop).rank;
      node.maxRank = g.node(node.borderBottom).rank;
      maxRank = Math.max(maxRank, node.maxRank);
    }
  });
  g.graph().maxRank = maxRank;
}

function removeEdgeLabelProxies(g) {
  g.nodes().forEach(v => {
    let node = g.node(v);
    if (node.dummy === "edge-proxy") {
      g.edge(node.e).labelRank = node.rank;
      g.removeNode(v);
    }
  });
}

function translateGraph(g) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = 0;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = 0;
  let graphLabel = g.graph();
  let marginX = graphLabel.marginx || 0;
  let marginY = graphLabel.marginy || 0;

  function getExtremes(attrs) {
    let x = attrs.x;
    let y = attrs.y;
    let w = attrs.width;
    let h = attrs.height;
    minX = Math.min(minX, x - w / 2);
    maxX = Math.max(maxX, x + w / 2);
    minY = Math.min(minY, y - h / 2);
    maxY = Math.max(maxY, y + h / 2);
  }

  g.nodes().forEach(v => getExtremes(g.node(v)));
  g.edges().forEach(e => {
    let edge = g.edge(e);
    if (edge.hasOwnProperty("x")) {
      getExtremes(edge);
    }
  });

  minX -= marginX;
  minY -= marginY;

  g.nodes().forEach(v => {
    let node = g.node(v);
    node.x -= minX;
    node.y -= minY;
  });

  g.edges().forEach(e => {
    let edge = g.edge(e);
    edge.points.forEach(p => {
      p.x -= minX;
      p.y -= minY;
    });
    if (edge.hasOwnProperty("x")) { edge.x -= minX; }
    if (edge.hasOwnProperty("y")) { edge.y -= minY; }
  });

  graphLabel.width = maxX - minX + marginX;
  graphLabel.height = maxY - minY + marginY;
}

function assignNodeIntersects(g) {
  g.edges().forEach(e => {
    let edge = g.edge(e);
    let nodeV = g.node(e.v);
    let nodeW = g.node(e.w);
    let p1, p2;
    if (!edge.points) {
      edge.points = [];
      p1 = nodeW;
      p2 = nodeV;
    } else {
      p1 = edge.points[0];
      p2 = edge.points[edge.points.length - 1];
    }
    edge.points.unshift(util.intersectRect(nodeV, p1));
    edge.points.push(util.intersectRect(nodeW, p2)); 
  });
}
// TODO: в поинтах есть фиктивные узлы. надо во время добавления информации добавляеть
//      через ребра, составляя фиктивные узлы в данных. Перебрать идею получения инфы о слоях. мб свой
// метод конвертирования в слои
// либо внутри каждого ребра хранить доп данные, либо по точкам ребер собирать всё.
// ну кстати как идея, если есть конечная точка и ребра хранят откуда и до куда идут, то
// там конвертацию точек можно сделать ,а иначе существующие правила
// TODO: для обратных линий нужно новое правило.
// TODO: правило для self
// TODO: выдавать ещё точки для label ребра чтобы устанавливать текст
// TODO: отдельные стрелки внутри узлов для "вывода" популяции
// order - позиция сортировки внутри слоя
function assignNodeIntersectsTView(g){
  let layers = util.buildLayerMatrix(g);
  let layers_data = [];
  for(let i = 0; i < layers.length/2; ++i){
    let layer_data = { id: i*2, lmiddle: 0, ups: [], dns: []}
    let Lmiddle = (layers[i*2].reduce((acc, v) => {
      let y =  g.node(v).y;
      return acc + y}, 0))/layers[i*2].length;
    layer_data.lmiddle = Lmiddle;
    layers[i*2].forEach((v) => {
      if(g.node(v).y > Lmiddle){
        layer_data.ups.push(v);
      }else{
        layer_data.dns.push(v);
      }
    })
    layer_data.ups.sort(function(v, w){return g.node(w).y - g.node(v).y});
    layer_data.dns.sort(function(v, w){return g.node(w).y - g.node(v).y}); 
    layers_data.push(layer_data)
    // console.log(layers[i].forEach(v => console.log(g.node(v))));
  }
  console.log(layers_data);

  for(let i = 0; i < layers_data.length -1; ++i){
    let lnodes = layers_data[i].ups.concat(layers_data[i].dns);
    let rnodes = layers_data[i+1].ups.concat(layers_data[i+1].dns);
    const mx_split = Math.max(layers_data[i+1].ups.length, layers_data[i+1].dns.length);
    let ro = g.node(rnodes[0]).x - g.node(lnodes[0]).x - g.node(lnodes[0]).width - 2*1; // 1 - beta, width need both nodes
    let rox = []
    rox.push(g.node(lnodes[0]).x);
    for(let j = 1; j <= mx_split; ++j){
      rox.push(rox[0] + j/(mx_split+1)*ro);
    }
    rox.push(g.node(rnodes[0]).x)
    console.log(rox);
    // от самого близкого к мидлу к дальнему
    console.log(layers_data[i+1].ups);
    console.log(layers_data[i+1].dns);
    layers_data[i+1].ups.forEach((v) => {
      g.inEdges(v).forEach((e) => {
        let edge = g.edge(e);
        let nodeV = g.node(e.v);
        let nodeW = g.node(e.w);
        console.log("ups " + e.v + " -> " + e.w);
        if(lnodes.find((p) => p == e.v)){ 
          let iof = (layers_data[i+1].ups.indexOf(e.w))%(rox.length -2)
          let ind = 1 + iof;
          console.log(ind)
          console.log(intersectT(nodeV.y, nodeW.y, rox, ind))
        }
      })
    })
    //тоже от самого близкого к мидлу к дальнему
    layers_data[i+1].dns.forEach((v) => {
      g.inEdges(v).forEach((e)=> {
        let edge = g.edge(e);
        let nodeV = g.node(e.v);
        let nodeW = g.node(e.w);
        console.log("dns " + e.v + " -> " + e.w);
        if(lnodes.find((p) => p == e.v)){ // TODO сделать так чтобы нормально было хз почему не работает
          let iof = (layers_data[i+1].dns.indexOf(e.w) +1)%(rox.length -2)
          let ind = (rox.length-2) - iof == 0 ? 1 : iof + 1;
          console.log(ind)
          console.log(intersectT(nodeV.y, nodeW.y, rox, ind))
        }
      })
    })
    // lnodes.forEach((v) =>{
    //   g.outEdges(v).forEach((e)=>{
    //     let edge = g.edge(e);
    //     let nodeV = g.node(e.v);
    //     let nodeW = g.node(e.w);
    //     // TODO: решить проблематику с портами. кому как присваивать координаты
    //     console.log(e.v + " -> " + e.w);
    //     console.log(intersectT(nodeV.y, nodeW.y, rox, 1));
        
    //   });
    // });
  }
}

function intersectT(yv, yw, rox, c){
  let points = [];
  points.push({x: rox[0], y: yv});
  points.push({x: rox[c], y: yv});
  points.push({x: rox[c], y: yw});
  points.push({x: rox[rox.length-1], y: yw});
  return points;
}

function sumLayerWeight(g){
  let layers = util.buildLayerMatrix(g);
  for(let i = 0; i < layers.length; ++i){
    let Lmiddle = (layers[i].reduce((acc, v) => {
      let y =  -g.node(v).x;
      return acc + y}, 0))/layers[i].length;
    layers[i].forEach((v) => {g.node(v).lw = Lmiddle});
  }
}
function fixupEdgeLabelCoords(g) {
  g.edges().forEach(e => {
    let edge = g.edge(e);
    if (edge.hasOwnProperty("x")) {
      if (edge.labelpos === "l" || edge.labelpos === "r") {
        edge.width -= edge.labeloffset;
      }
      switch (edge.labelpos) {
      case "l": edge.x -= edge.width / 2 + edge.labeloffset; break;
      case "r": edge.x += edge.width / 2 + edge.labeloffset; break;
      }
    }
  });
}

function reversePointsForReversedEdges(g) {
  g.edges().forEach(e => {
    let edge = g.edge(e);
    if (edge.reversed) {
      edge.points.reverse();
    }
  });
}

function removeBorderNodes(g) {
  g.nodes().forEach(v => {
    if (g.children(v).length) {
      let node = g.node(v);
      let t = g.node(node.borderTop);
      let b = g.node(node.borderBottom);
      let l = g.node(node.borderLeft[node.borderLeft.length - 1]);
      let r = g.node(node.borderRight[node.borderRight.length - 1]);

      node.width = Math.abs(r.x - l.x);
      node.height = Math.abs(b.y - t.y);
      node.x = l.x + node.width / 2;
      node.y = t.y + node.height / 2;
    }
  });

  g.nodes().forEach(v => {
    if (g.node(v).dummy === "border") {
      g.removeNode(v);
    }
  });
}

function removeSelfEdges(g) {
  g.edges().forEach(e => {
    if (e.v === e.w) {
      var node = g.node(e.v);
      if (!node.selfEdges) {
        node.selfEdges = [];
      }
      node.selfEdges.push({ e: e, label: g.edge(e) });
      g.removeEdge(e);
    }
  });
}

function insertSelfEdges(g) {
  var layers = util.buildLayerMatrix(g);
  layers.forEach(layer => {
    var orderShift = 0;
    layer.forEach((v, i) => {
      var node = g.node(v);
      node.order = i + orderShift;
      (node.selfEdges || []).forEach(selfEdge => {
        util.addDummyNode(g, "selfedge", {
          width: selfEdge.label.width,
          height: selfEdge.label.height,
          rank: node.rank,
          order: i + (++orderShift),
          e: selfEdge.e,
          label: selfEdge.label
        }, "_se");
      });
      delete node.selfEdges;
    });
  });
}

function positionSelfEdges(g) {
  g.nodes().forEach(v => {
    var node = g.node(v);
    if (node.dummy === "selfedge") {
      var selfNode = g.node(node.e.v);
      var x = selfNode.x + selfNode.width / 2;
      var y = selfNode.y;
      var dx = node.x - x;
      var dy = selfNode.height / 2;
      g.setEdge(node.e, node.label);
      g.removeNode(v);
      // вот кстати то что было в том реферате у graphviz
      node.label.points = [
        { x: x + 2 * dx / 3, y: y - dy },
        { x: x + 5 * dx / 6, y: y - dy },
        { x: x +     dx    , y: y },
        { x: x + 5 * dx / 6, y: y + dy },
        { x: x + 2 * dx / 3, y: y + dy }
      ];
      node.label.x = node.x;
      node.label.y = node.y;
    }
  });
}

function selectNumberAttrs(obj, attrs) {
  return util.mapValues(util.pick(obj, attrs), Number);
}

function canonicalize(attrs) {
  var newAttrs = {};
  if (attrs) {
    Object.entries(attrs).forEach(([k, v]) => {
      if (typeof k === "string") {
        k = k.toLowerCase();
      }

      newAttrs[k] = v;
    });
  }
  return newAttrs;
}
