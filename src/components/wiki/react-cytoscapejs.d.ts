declare module 'react-cytoscapejs' {
  import { Component, CSSProperties } from 'react';
  import { EventHandler, Core } from 'cytoscape';

  interface CytoscapeComponentProps {
    id?: string;
    cy?: (cy: Core) => void;
    style?: CSSProperties;
    className?: string;
    elements?: any[];
    layout?: any;
    stylesheet?: any[];
    zoom?: number;
    zoomingEnabled?: boolean;
    minZoom?: number;
    maxZoom?: number;
    autoungrabify?: boolean;
    autounselectify?: boolean;
    boxSelectionEnabled?: boolean;
    userZoomingEnabled?: boolean;
    userPanningEnabled?: boolean;
    pan?: { x: number; y: number };
    headless?: boolean;
    styleEnabled?: boolean;
    hideEdgesOnViewport?: boolean;
    textureOnViewport?: boolean;
    motionBlur?: boolean;
    motionBlurOpacity?: number;
    wheelSensitivity?: number;
    pixelRatio?: number;
    tap?: EventHandler;
    touchstart?: EventHandler;
    touchmove?: EventHandler;
    touchend?: EventHandler;
    mousedown?: EventHandler;
    mouseup?: EventHandler;
  }

  export default class CytoscapeComponent extends Component<CytoscapeComponentProps> {}
}
