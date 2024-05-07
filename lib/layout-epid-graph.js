let Graph = require("@dagrejs/graphlib").Graph;
let util = require("./util");


module.exports = assignNodeIntersects;

/**
 * 
 * @argument g - graph
 * @argument opts - label of data {offset, ...}
 * @returns graph with assign node intersects by T-rules
 */
function assignNodeIntersects(g, opts){
// 1. конвертация графа в слои с информацией о последующих (ребер).
    const layered_graph = buildLayersInfo(g);
    console.log(layered_graph);


    for(let i = 0; i < layered_graph.length - 1; ++i){
        const ro = computeAvaliableDistance(layered_graph[i], layered_graph[i+1], opts);
        console.log(ro);
//TODO: подсчет кол-ва ребер, и высчитывание кол-ва прямых изгибов.
    }

// по слоям

// 2. подсчет доступного расстояния.

// 3. берем инфу и вычситываем rox

// 4. выдаем каждую по каждому ребру относительно правил

// 5. даем координаты.
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
    const layer_middle = (layer.reduce((acc, v) => {
        let y = g.node(v).y;
        return acc + y}, 0))/layer.length;
    let nodes = [];
    layer.forEach(v => {
        nodes.push(v);
    });
    return {
        id: id, 
        m: layer_middle, 
        n: nodes, 
        x: g.node(layer[0]).x,
        width: g.node(layer[0]).width};
}
