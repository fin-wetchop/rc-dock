import * as React from "react";
import {
  BoxData,
  DockContext,
  DockContextType,
  DockMode,
  DropDirection,
  PanelData,
  TabData,
  TabGroup
} from "./DockData";
import {DragDropDiv} from "./dragdrop/DragDropDiv";
import {DragState} from "./dragdrop/DragManager";

interface DockDropEdgeProps {
  panelData: PanelData;
  panelElement: HTMLElement;
  dropFromPanel: PanelData;
}

export class DockDropEdge extends React.PureComponent<DockDropEdgeProps, any> {
  static contextType = DockContextType;

  context!: DockContext;

  _ref: HTMLDivElement;
  getRef = (r: HTMLDivElement) => {
    this._ref = r;
  };


  getDirection(e: DragState, isFloating: boolean, fromGroup: TabGroup, toGroup: TabGroup, samePanel: boolean, tabLength: number): {direction: DropDirection, mode?: DockMode, depth: number} {
    let rect = this._ref.getBoundingClientRect();

    let widthRate = Math.min(rect.width, 500);
    let heightRate = Math.min(rect.height, 500);
    let left = e.clientX - rect.left;
    let right = rect.right - e.clientX;
    let top = e.clientY - rect.top;
    let bottom = rect.bottom - e.clientY;

    let depth = 0;

    let firstLevel = 0
    let secondLevel: number;
    let thirdLevel: number;
    let fourthLevel: number;
    let fifthLevel: number;

    if (isFloating) {
      secondLevel = 10;
      thirdLevel = 20;
      fourthLevel = 30;
    } else {
      left /= widthRate;
      right /= widthRate;
      top /= heightRate;
      bottom /= heightRate;

      secondLevel = 0.075
      thirdLevel = 0.15
      fourthLevel = 0.3
      fifthLevel = 0.75
    }

    let min = Math.min(left, right, top, bottom);

    if (fromGroup.disableDock || samePanel) {
      // use an impossible min value to disable dock drop
      min = 1;
    }
    if (min < firstLevel) {
      return {direction: null, depth: 0};
    } else if (min < secondLevel) {
      depth = 3; // depth 3 or 4
    } else if (min < thirdLevel) {
      depth = 1; // depth 1 or 2
    } else if (min < fourthLevel) {
      // default
    } else if (min < fifthLevel && !toGroup.disableDock) {
      return {direction: "middle", depth}
    } else if (fromGroup.floatable) {
      if (fromGroup.floatable === 'singleTab') {
        if (tabLength === 1) {
          // singleTab can float only with one tab
          return {direction: 'float', mode: 'float', depth: 0};
        }
      } else {
        return {direction: 'float', mode: 'float', depth: 0};
      }
    }
    switch (min) {
      case left: {
        return {direction: 'left', mode: 'horizontal', depth};
      }
      case right: {
        return {direction: 'right', mode: 'horizontal', depth};
      }
      case top: {
        return {direction: 'top', mode: 'vertical', depth};
      }
      case bottom: {
        return {direction: 'bottom', mode: 'vertical', depth};
      }
    }
    // probably a invalid input causing everything to be NaN?
    return {direction: null, depth: 0};
  }

  getActualDepth(depth: number, mode: DockMode, direction: DropDirection): number {
    let afterPanel = (direction === 'bottom' || direction === 'right');
    if (!depth) {
      return depth;
    }
    let {panelData} = this.props;
    let previousTarget: BoxData | PanelData = panelData;
    let targetBox: BoxData = panelData.parent;
    let lastDepth = 0;
    if (panelData.parent.mode === mode) {
      ++depth;
    }
    while (targetBox && lastDepth < depth) {
      if (targetBox.mode === mode) {
        if (afterPanel) {
          if (targetBox.children.at(-1) !== previousTarget) {
            // dont go deeper if current target is on different side of the box
            break;
          }
        } else {
          if (targetBox.children[0] !== previousTarget) {
            // dont go deeper if current target is on different side of the box
            break;
          }
        }
      }
      previousTarget = targetBox;
      targetBox = targetBox.parent;
      ++lastDepth;
    }
    while (depth > lastDepth) {
      depth -= 2;
    }
    return depth;
  }

  onDragOver = (e: DragState) => {
    let {panelData, panelElement, dropFromPanel} = this.props;
    let dockId = this.context.getDockId();
    let draggingPanel = DragState.getData('panel', dockId);

    let fromGroup = this.context.getGroup(dropFromPanel.group);
    let toGroup = this.context.getGroup(panelData.group);

    const isFloating = draggingPanel && draggingPanel.parent?.mode === 'float'

    let {
      direction,
      mode,
      depth
    } = this.getDirection(e, isFloating, fromGroup, toGroup, draggingPanel === panelData, draggingPanel?.tabs?.length ?? 1);

    if (isFloating && !["left", "right", "top", "bottom"].includes(direction)) {
      // ignore float panel in edge mode
      return;
    }

    depth = this.getActualDepth(depth, mode, direction);

    if (!direction || (direction === 'float' && dropFromPanel.panelLock)) {
      this.context.setDropRect(null, 'remove', this);

      return;
    }

    let targetElement = panelElement;

    for (let i = 0; i < depth; ++i) {
      targetElement = targetElement.parentElement;
    }

    let panelSize: [number, number] = DragState.getData('panelSize', dockId);

    this.context.setDropRect(targetElement, direction, this, e, panelSize);

    e.accept('');
  };

  onDragLeave = (e: DragState) => {
    this.context.setDropRect(null, 'remove', this);
  };

  onDrop = (e: DragState) => {
    let {panelData, dropFromPanel} = this.props;
    let dockId = this.context.getDockId();
    let fromGroup = this.context.getGroup(dropFromPanel.group);
    let toGroup = this.context.getGroup(panelData.group);
    let source: TabData | PanelData = DragState.getData('tab', dockId);
    let draggingPanel = DragState.getData('panel', dockId);

    const isFloating = draggingPanel && draggingPanel.parent?.mode === 'float'

    if (!source) {
      source = draggingPanel;
    }

    if (source) {
      let {
        direction,
        mode,
        depth
      } = this.getDirection(e, isFloating, fromGroup, toGroup, draggingPanel === panelData, draggingPanel?.tabs?.length ?? 1);

      depth = this.getActualDepth(depth, mode, direction);
      
      if (!direction) {
        return;
      }

      let target: PanelData | BoxData = panelData;
      
      for (let i = 0; i < depth; ++i) {
        target = target.parent;
      }

      this.context.dockMove(source, target, direction);
    }
  };

  render()
    :
    React.ReactNode {
    return (
      <DragDropDiv getRef={this.getRef} className="dock-drop-edge"
                   onDragOverT={this.onDragOver} onDragLeaveT={this.onDragLeave} onDropT={this.onDrop}/>
    );
  }

  componentWillUnmount()
    :
    void {
    this.context.setDropRect(null, 'remove', this);
  }
}
