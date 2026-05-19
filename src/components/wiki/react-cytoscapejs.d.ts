declare module 'react-cytoscapejs' {
  import { Component, CSSProperties } from 'react';
  import { EventHandler, Core, LayoutOptions, Stylesheet } from 'cytoscape';

  interface CytoscapeComponentProps {
    id?: string;
    cy?: (cy: Core) => void;
    style?: CSSProperties;
    className?: string;
    elements?: Array<{ data: Record<string, unknown>; position?: Record<string, number> }>;
    layout?: LayoutOptions;
    stylesheet?: Stylesheet[];
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
