let Graph = require("@dagrejs/graphlib").Graph;
const sort = require("./order/sort");
let util = require("./util");


module.exports = assignNodeIntersects;

/**
 * 
 * @argument g - graph
 * @argument opts - label of data {offset, ...}
 * @returns graph with assign node intersects by T-rules
 */
function assignNodeIntersects(g, opts){
    const layered_graph = buildLayersInfo(g);
    adustEdges(g);
    for(let i = 0; i < layered_graph.length - 1; ++i){
        const ro = computeAvaliableDistance(layered_graph[i], layered_graph[i+1], opts);

        let ups = getEdges(g, layered_graph[i], {rule:"ups"});
        let downs = getEdges(g, layered_graph[i], {rule:"down"});

        const rox = computeRox(ro, ups, downs);
        setIntersectT(g, ups, rox, {rule: "ups"});
        setIntersectT(g, downs, rox, {rule: "down"});
    }
    // sortingEndStartPoints(g);


// 4. выдаем каждую по каждому ребру относительно правил

// 5. даем координаты.
}
function intersectRectInOut(g, e){
    let edge = g.edge(e);
    let nodeW = g.node(e.w);
    let nodeV = g.node(e.v);
    p1 = edge.points[0];
    edge.points.unshift(util.intersectRect(nodeV, p1));
    p2 = edge.points[0];
    edge.points.push(util.intersectRect(nodeW, p2));
}

function sortApplyPorts(g, edges, node_data){
    // sort(edges, function(el, er)
    //     {return g.edge(el)[opts.rule != "in" ? 0 : g.edge(el).points.length - 1].y - g.edge(er)[opts.rule != "in" ? 0 : g.edge(er).points.length - 1].y})
    if(edges.length == 1){
        adjustCurvesBySorting(g, g.edge(edges[0]), node_data.y, {rule: node_data.rule});
        return;
    }

    if(edges.length){
        const between_distance = node_data.h / (edges.length+1);
        edges.forEach((e, index) => {
            let edge = g.edge(e);
            adjustCurvesBySorting(g, edge, between_distance*(index+1) + node_data.y, {rule:node_data.rule});
        });
    }
}


function adjustCurvesBySorting(g, edge, y, opts){
    const old_y = edge.points[opts.rule != "in" ? 0 : edge.points.length - 1].y;
    edge.points.forEach((point) => {
        if(point.y == old_y){ point.y = y; }
    });
}

function sortingEndStartPoints(g){
    g.nodes().forEach((v) => {
        let nodeV = g.node(v);
        let data = {y: nodeV.y, h: nodeV.height}

        let inEdges = g.inEdges(v).sort((el, er) => { g.node(el.w).y - g.node(er.w).y });
        sortApplyPorts(g, inEdges, {...data, rule: "in"});
        let outEdges = g.outEdges(v).sort((el, er) => { g.node(el.v).y - g.node(er.v).y });
        sortApplyPorts(g, outEdges, {...data, rule: "out"});
    });
}

function adjustPointsY(g, e){
    intersectRectInOut(g, e);
    let edge = g.edge(e);
    p_last = edge.points[edge.points.length - 1];
    edge.points.forEach((point, index) => {
        if(index == 0) return;
        point.y = p_last.y;
    })
}

function adustEdges(g){
    g.edges().forEach((e) => {
        adjustPointsY(g, e);
    })
}

function intersectT(v, w, rox, c){
    let points = [];
    points.push({x: rox[0], y: v.y});
    points.push({x: rox[c], y: v.y});
    points.push({x: rox[c], y: w.y});
    points.push({x: rox[rox.length-1], y: w.y});
    return points;
}

function setIntersectT(g, edges, rox, opts){
    
    edges.forEach((e) => {
        let edge = g.edge(e);
        let nodeV = g.node(e.v);
        let nodeW = g.node(e.w);
        let ind; 
        if(opts.rule == "down"){
            ind = edges.indexOf(e)%(rox.length-2) + 1;}
        else{
            const iof = (edges.indexOf(e)+1)%(rox.length-2);
            ind = (rox.length-2) - iof == 0 ? 1 : iof + 1
        }
        
        // adjustPointsY(g, e);
        let p1 = edge.points[0];
        let p2 = edge.points[1]; // 100% exist
        const points = intersectT(p1, p2, rox, ind);
        edge.points.splice(1, 1, ...points);
    });
}

function computeRox(ro, ups, downs){
    let rox = [];
    rox.push(ro.p0);
    const mx_split = Math.max(ups.length, downs.length);
    for(let j = 1; j <= mx_split; ++j){
        rox.push(rox[0] + j/(mx_split + 1)*ro.ro);
    }
    rox.push(ro.pn);
    return rox;
}

/**
 * Получаем по правилу верхние или нижние ребра и сортируем их по возрастанию
 * @argument g 
 * @argument layer 
 * @argument opts - {rule: ups/down} | null 
 */
function getEdges(g, layer, opts = null){
    let edges = [];
    layer.n.forEach((v) => {
        g.edges().forEach((e) => { 
            if(e.v == v){
                if(!opts){edges.push(e);}
                else if(opts.rule == "ups" && g.node(e.w).y > layer.m){ edges.push(e); }
                else if(opts.rule == "down" && g.node(e.w).y <= layer.m){  edges.push(e); }
            }
        });
    });
    edges.sort(function(e0, e1){return g.node(e0.w).y - g.node(e1.w).y});
    return edges;
}

function computeAvaliableDistance(layer_prev, layer_next, opts){
    let offset = opts.offset ? opts.offset : 0;
    return {
        p0: layer_prev.x + layer_prev.width/2 + offset,
        pn: layer_next.x - layer_next.width/2 - offset,
        ro: layer_next.x - layer_prev.x - layer_prev.width - 2*offset,
    };
}

function buildLayersInfo(g){
    let layers_matrix = util.buildLayerMatrix(g);
    let layers_data = [];
    for(let i = 0; i < layers_matrix.length/2; ++i){
        layers_data.push(buildLayerInfo(g, i*2, layers_matrix[i*2]));
    }
    return layers_data;
}

function buildLayerInfo(g, id, layer){
    let nodes = [];
    layer.forEach(v => {
        nodes.push(v);
    });
    const layer_middle = (nodes.reduce((acc, v) => {
        let y = g.node(v).y;
        return acc + y}, 0))/nodes.length;
    return {
        id: id, 
        m: layer_middle, 
        n: nodes, 
        x: g.node(nodes[0]).x,
        width: g.node(nodes[0]).width};
}
