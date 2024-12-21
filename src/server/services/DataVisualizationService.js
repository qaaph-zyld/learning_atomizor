const d3 = require('d3');
const { createCanvas } = require('canvas');
const logger = require('./LoggerService');
const redis = require('./CacheService');

class DataVisualizationService {
  constructor() {
    this.config = {
      cacheExpiration: 3600, // 1 hour
      maxDataPoints: 10000,
      defaultWidth: 800,
      defaultHeight: 600,
      defaultMargin: {
        top: 20,
        right: 30,
        bottom: 40,
        left: 50
      },
      defaultColors: [
        '#4e79a7', '#f28e2c', '#e15759', '#76b7b2',
        '#59a14f', '#edc949', '#af7aa1', '#ff9da7',
        '#9c755f', '#bab0ab'
      ]
    };
  }

  /**
   * Generate visualization
   */
  async generateVisualization(data, options) {
    try {
      // Validate options
      this.validateOptions(options);

      // Check cache
      const cacheKey = this.generateCacheKey(data, options);
      const cachedViz = await redis.get(`viz:${cacheKey}`);
      if (cachedViz) {
        return JSON.parse(cachedViz);
      }

      // Generate visualization based on type
      let visualization;
      switch (options.type) {
        case 'line':
          visualization = await this.generateLineChart(data, options);
          break;
        case 'bar':
          visualization = await this.generateBarChart(data, options);
          break;
        case 'pie':
          visualization = await this.generatePieChart(data, options);
          break;
        case 'scatter':
          visualization = await this.generateScatterPlot(data, options);
          break;
        case 'heatmap':
          visualization = await this.generateHeatmap(data, options);
          break;
        case 'sankey':
          visualization = await this.generateSankeyDiagram(data, options);
          break;
        default:
          throw new Error('Unsupported visualization type');
      }

      // Cache visualization
      await redis.set(
        `viz:${cacheKey}`,
        JSON.stringify(visualization),
        'EX',
        this.config.cacheExpiration
      );

      return visualization;
    } catch (error) {
      logger.error('Error generating visualization:', error);
      throw error;
    }
  }

  /**
   * Validate visualization options
   */
  validateOptions(options) {
    const requiredFields = ['type', 'width', 'height'];
    requiredFields.forEach(field => {
      if (!options[field]) {
        options[field] = this.config[`default${field.charAt(0).toUpperCase()}${field.slice(1)}`];
      }
    });

    if (!options.margin) {
      options.margin = this.config.defaultMargin;
    }

    if (!options.colors) {
      options.colors = this.config.defaultColors;
    }
  }

  /**
   * Generate line chart
   */
  async generateLineChart(data, options) {
    const canvas = createCanvas(options.width, options.height);
    const context = canvas.getContext('2d');

    // Set up scales
    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.x))
      .range([options.margin.left, options.width - options.margin.right]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.y)])
      .range([options.height - options.margin.bottom, options.margin.top]);

    // Draw axes
    this.drawAxes(context, x, y, options);

    // Draw line
    context.beginPath();
    context.strokeStyle = options.colors[0];
    context.lineWidth = 2;

    const line = d3.line()
      .x(d => x(d.x))
      .y(d => y(d.y))
      .context(context);

    line(data);
    context.stroke();

    return canvas.toBuffer();
  }

  /**
   * Generate bar chart
   */
  async generateBarChart(data, options) {
    const canvas = createCanvas(options.width, options.height);
    const context = canvas.getContext('2d');

    // Set up scales
    const x = d3.scaleBand()
      .domain(data.map(d => d.label))
      .range([options.margin.left, options.width - options.margin.right])
      .padding(0.1);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value)])
      .range([options.height - options.margin.bottom, options.margin.top]);

    // Draw axes
    this.drawAxes(context, x, y, options);

    // Draw bars
    data.forEach((d, i) => {
      context.fillStyle = options.colors[i % options.colors.length];
      context.fillRect(
        x(d.label),
        y(d.value),
        x.bandwidth(),
        options.height - options.margin.bottom - y(d.value)
      );
    });

    return canvas.toBuffer();
  }

  /**
   * Generate pie chart
   */
  async generatePieChart(data, options) {
    const canvas = createCanvas(options.width, options.height);
    const context = canvas.getContext('2d');

    const radius = Math.min(options.width, options.height) / 2;
    const centerX = options.width / 2;
    const centerY = options.height / 2;

    const pie = d3.pie()
      .value(d => d.value)
      .sort(null);

    const arc = d3.arc()
      .innerRadius(0)
      .outerRadius(radius);

    // Draw slices
    const arcs = pie(data);
    arcs.forEach((d, i) => {
      context.beginPath();
      context.fillStyle = options.colors[i % options.colors.length];
      
      const path = new Path2D();
      arc.context(path)(d);
      
      context.fill(path);
      context.strokeStyle = '#fff';
      context.stroke(path);
    });

    return canvas.toBuffer();
  }

  /**
   * Generate scatter plot
   */
  async generateScatterPlot(data, options) {
    const canvas = createCanvas(options.width, options.height);
    const context = canvas.getContext('2d');

    // Set up scales
    const x = d3.scaleLinear()
      .domain(d3.extent(data, d => d.x))
      .range([options.margin.left, options.width - options.margin.right]);

    const y = d3.scaleLinear()
      .domain(d3.extent(data, d => d.y))
      .range([options.height - options.margin.bottom, options.margin.top]);

    // Draw axes
    this.drawAxes(context, x, y, options);

    // Draw points
    data.forEach((d, i) => {
      context.beginPath();
      context.fillStyle = options.colors[i % options.colors.length];
      context.arc(x(d.x), y(d.y), 4, 0, 2 * Math.PI);
      context.fill();
    });

    return canvas.toBuffer();
  }

  /**
   * Generate heatmap
   */
  async generateHeatmap(data, options) {
    const canvas = createCanvas(options.width, options.height);
    const context = canvas.getContext('2d');

    // Set up scales
    const x = d3.scaleBand()
      .domain(d3.range(data[0].length))
      .range([options.margin.left, options.width - options.margin.right]);

    const y = d3.scaleBand()
      .domain(d3.range(data.length))
      .range([options.margin.top, options.height - options.margin.bottom]);

    const color = d3.scaleSequential(d3.interpolateViridis)
      .domain([0, d3.max(data.flat())]);

    // Draw cells
    data.forEach((row, i) => {
      row.forEach((value, j) => {
        context.fillStyle = color(value);
        context.fillRect(x(j), y(i), x.bandwidth(), y.bandwidth());
      });
    });

    return canvas.toBuffer();
  }

  /**
   * Generate Sankey diagram
   */
  async generateSankeyDiagram(data, options) {
    const canvas = createCanvas(options.width, options.height);
    const context = canvas.getContext('2d');

    const sankey = d3.sankey()
      .nodeWidth(15)
      .nodePadding(10)
      .extent([
        [options.margin.left, options.margin.top],
        [options.width - options.margin.right, options.height - options.margin.bottom]
      ]);

    const { nodes, links } = sankey(data);

    // Draw links
    links.forEach((link, i) => {
      context.beginPath();
      context.fillStyle = options.colors[i % options.colors.length];
      
      d3.sankeyLinkHorizontal()(link).context(context)();
      
      context.fill();
      context.strokeStyle = '#fff';
      context.stroke();
    });

    // Draw nodes
    nodes.forEach((node, i) => {
      context.fillStyle = options.colors[i % options.colors.length];
      context.fillRect(node.x0, node.y0, node.x1 - node.x0, node.y1 - node.y0);
    });

    return canvas.toBuffer();
  }

  /**
   * Draw axes
   */
  drawAxes(context, x, y, options) {
    // Draw x-axis
    context.beginPath();
    context.moveTo(options.margin.left, options.height - options.margin.bottom);
    context.lineTo(options.width - options.margin.right, options.height - options.margin.bottom);
    context.stroke();

    // Draw y-axis
    context.beginPath();
    context.moveTo(options.margin.left, options.margin.top);
    context.lineTo(options.margin.left, options.height - options.margin.bottom);
    context.stroke();

    // Draw ticks and labels
    this.drawTicks(context, x, y, options);
  }

  /**
   * Draw ticks and labels
   */
  drawTicks(context, x, y, options) {
    const xTicks = x.ticks ? x.ticks(10) : x.domain();
    const yTicks = y.ticks(10);

    context.textAlign = 'center';
    context.textBaseline = 'top';

    // X-axis ticks and labels
    xTicks.forEach(tick => {
      const xPos = x(tick);
      
      context.beginPath();
      context.moveTo(xPos, options.height - options.margin.bottom);
      context.lineTo(xPos, options.height - options.margin.bottom + 6);
      context.stroke();

      context.fillText(
        tick.toString(),
        xPos,
        options.height - options.margin.bottom + 8
      );
    });

    context.textAlign = 'right';
    context.textBaseline = 'middle';

    // Y-axis ticks and labels
    yTicks.forEach(tick => {
      const yPos = y(tick);
      
      context.beginPath();
      context.moveTo(options.margin.left - 6, yPos);
      context.lineTo(options.margin.left, yPos);
      context.stroke();

      context.fillText(
        tick.toString(),
        options.margin.left - 8,
        yPos
      );
    });
  }

  /**
   * Generate cache key for visualization
   */
  generateCacheKey(data, options) {
    const components = [
      options.type,
      options.width,
      options.height,
      JSON.stringify(data)
    ];

    return crypto
      .createHash('md5')
      .update(components.join('|'))
      .digest('hex');
  }

  /**
   * Generate legend
   */
  generateLegend(labels, options) {
    const legendHeight = 30 * labels.length;
    const canvas = createCanvas(200, legendHeight);
    const context = canvas.getContext('2d');

    labels.forEach((label, i) => {
      const y = i * 30 + 15;

      // Draw color box
      context.fillStyle = options.colors[i % options.colors.length];
      context.fillRect(10, y - 8, 16, 16);

      // Draw label
      context.fillStyle = '#000';
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillText(label, 36, y);
    });

    return canvas.toBuffer();
  }

  /**
   * Add title and annotations
   */
  addAnnotations(canvas, annotations) {
    const context = canvas.getContext('2d');

    annotations.forEach(annotation => {
      context.save();

      // Set styles
      context.font = annotation.font || '12px sans-serif';
      context.fillStyle = annotation.color || '#000';
      context.textAlign = annotation.align || 'left';
      context.textBaseline = annotation.baseline || 'top';

      // Draw text
      context.fillText(
        annotation.text,
        annotation.x,
        annotation.y
      );

      // Draw connector line if specified
      if (annotation.connector) {
        context.beginPath();
        context.strokeStyle = annotation.color || '#000';
        context.moveTo(annotation.x, annotation.y);
        context.lineTo(
          annotation.connector.x,
          annotation.connector.y
        );
        context.stroke();
      }

      context.restore();
    });

    return canvas;
  }

  /**
   * Add watermark
   */
  addWatermark(canvas, text) {
    const context = canvas.getContext('2d');

    context.save();
    context.globalAlpha = 0.1;
    context.font = '24px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(-Math.PI / 4);
    context.fillText(text, 0, 0);
    context.restore();

    return canvas;
  }

  /**
   * Export visualization
   */
  async exportVisualization(visualization, format) {
    switch (format) {
      case 'png':
        return visualization;
      case 'svg':
        return this.convertToSVG(visualization);
      default:
        throw new Error('Unsupported export format');
    }
  }

  /**
   * Convert canvas to SVG
   */
  convertToSVG(canvasBuffer) {
    // Implementation for converting canvas buffer to SVG
    // This would require additional SVG generation logic
    throw new Error('SVG conversion not implemented');
  }
}

module.exports = new DataVisualizationService();
