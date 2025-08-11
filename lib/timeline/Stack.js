// Utility functions for ordering and stacking of items
const EPSILON = 0.001; // used when checking collisions, to prevent round-off errors

/**
 * Order items by their start data
 * @param {Item[]} items
 */
export function orderByStart(items) {
  items.sort((a, b) => a.data.start - b.data.start);
}

/**
 * Order items by their end date. If they have no end date, their start date
 * is used.
 * @param {Item[]} items
 */
export function orderByEnd(items) {
  items.sort((a, b) => {
    const aTime = ('end' in a.data) ? a.data.end : a.data.start;
    const bTime = ('end' in b.data) ? b.data.end : b.data.start;

    return aTime - bTime;
  });
}

/**
 * Adjust vertical positions of the items such that they don't overlap each
 * other.
 * @param {Item[]} items
 *            All visible items
 * @param {{item: {horizontal: number, vertical: number}, axis: number}} margin
 *            Margins between items and between items and the axis.
 * @param {boolean} [force=false]
 *            If true, all items will be repositioned. If false (default), only
 *            items having a top===null will be re-stacked
 * @param {function} shouldBailItemsRedrawFunction
 *            bailing function
 * @return {boolean} shouldBail
 */
export function stack(items, margin, force, shouldBailItemsRedrawFunction) {
  const stackingResult = performStacking(
    items,
    margin.item,
    false,
    item => item.stack && (force || item.top === null),
    item => item.stack,
    item => margin.axis,
    shouldBailItemsRedrawFunction
  );

  // If shouldBail function returned true during stacking calculation
  return stackingResult === null;
}

/**
 * Adjust vertical positions of the items within a single subgroup such that they
 * don't overlap each other.
 * @param {Item[]} items
 *            All items withina subgroup
 * @param {{item: {horizontal: number, vertical: number}, axis: number}} margin
 *            Margins between items and between items and the axis.
 * @param {subgroup} subgroup
 *            The subgroup that is being stacked
 */
export function substack(items, margin, subgroup) {
  const subgroupHeight = performStacking(
    items,
    margin.item,
    false,
    item => item.stack,
    item => true,
    item => item.baseTop
  );
  subgroup.height = subgroupHeight - subgroup.top + 0.5 * margin.item.vertical;
}

/**
 * Adjust vertical positions of the items without stacking them
 * @param {Item[]} items
 *            All visible items
 * @param {{item: {horizontal: number, vertical: number}, axis: number}} margin
 *            Margins between items and between items and the axis.
 * @param {subgroups[]} subgroups
 *            All subgroups
 * @param {boolean} isStackSubgroups
 */
export function nostack(items, margin, subgroups, isStackSubgroups) {
  for (let i = 0; i < items.length; i++) {
    if (items[i].data.subgroup == undefined) {
      items[i].top = margin.item.vertical;
    } else if (items[i].data.subgroup !== undefined && isStackSubgroups) {
      let newTop = 0;
      for (const subgroup in subgroups) {
        if (subgroups.hasOwnProperty(subgroup)) {
          if (subgroups[subgroup].visible == true && subgroups[subgroup].index < subgroups[items[i].data.subgroup].index) {
            newTop += subgroups[subgroup].height;
            subgroups[items[i].data.subgroup].top = newTop;
          }
        }
      }
      items[i].top = newTop + 0.5 * margin.item.vertical;
    }
  }
  if (!isStackSubgroups) {
    stackSubgroups(items, margin, subgroups)
  }
}

/**
 * Adjust vertical positions of the subgroups such that they don't overlap each
 * other.
 * @param {Array.<timeline.Item>} items
 * @param {{item: {horizontal: number, vertical: number}, axis: number}} margin Margins between items and between items and the axis.
 * @param {subgroups[]} subgroups
 *            All subgroups
 */
export function stackSubgroups(items, margin, subgroups) {
  performStacking(
    Object.values(subgroups).sort((a, b) => {
      if(a.index > b.index) return 1; 
      if(a.index < b.index) return -1; 
      return 0; 
    }),
    {
      vertical: 0
    },
    true,
    item => true,
    item => true,
    item => 0
  );

  for (let i = 0; i < items.length; i++) {
    if (items[i].data.subgroup !== undefined) {
      items[i].top = subgroups[items[i].data.subgroup].top + 0.5 * margin.item.vertical;
    }
  }
}

/**
 * Adjust vertical positions of the subgroups such that they don't overlap each
 * other, then stacks the contents of each subgroup individually.
 * @param {Item[]} subgroupItems
 *            All the items in a subgroup
 * @param {{item: {horizontal: number, vertical: number}, axis: number}} margin
 *            Margins between items and between items and the axis.
 * @param {subgroups[]} subgroups
 *            All subgroups
 */
export function stackSubgroupsWithInnerStack(subgroupItems, margin, subgroups) {
  let doSubStack = false;

  // Run subgroups in their order (if any)
  const subgroupOrder = [];

  for(var subgroup in subgroups) {
    if (subgroups[subgroup].hasOwnProperty("index")) {
      subgroupOrder[subgroups[subgroup].index] = subgroup;
    }
    else {
      subgroupOrder.push(subgroup);
    }
  }

  for(let j = 0; j < subgroupOrder.length; j++) {
    subgroup = subgroupOrder[j];
    if (subgroups.hasOwnProperty(subgroup)) {

      doSubStack = doSubStack || subgroups[subgroup].stack;
      subgroups[subgroup].top = 0;

      for (const otherSubgroup in subgroups) {
        if (subgroups[otherSubgroup].visible && subgroups[subgroup].index > subgroups[otherSubgroup].index) {
          subgroups[subgroup].top += subgroups[otherSubgroup].height;
        }
      }

      const items = subgroupItems[subgroup];
      for(let i = 0; i < items.length; i++) {
        if (items[i].data.subgroup !== undefined) {
          items[i].top = subgroups[items[i].data.subgroup].top + 0.5 * margin.item.vertical;

          if (subgroups[subgroup].stack) {
            items[i].baseTop = items[i].top;
          }
        }
      }

      if (doSubStack && subgroups[subgroup].stack) {
        substack(subgroupItems[subgroup], margin, subgroups[subgroup]);
      }
    }
  }
}

/**
 * Test if the two provided items collide
 * The items must have parameters left, width, top, and height.
 * @param {Item} a          The first item
 * @param {Item} b          The second item
 * @param {{horizontal: number, vertical: number}} margin
 *                          An object containing a horizontal and vertical
 *                          minimum required margin.
 * @param {boolean} rtl
 * @return {boolean}        true if a and b collide, else false
 */
export function collision(a, b, margin, rtl) {
  if (rtl) {
    return  ((a.right - margin.horizontal + EPSILON)  < (b.right + b.width) &&
    (a.right + a.width + margin.horizontal - EPSILON) > b.right &&
    (a.top - margin.vertical + EPSILON)              < (b.top + b.height) &&
    (a.top + a.height + margin.vertical - EPSILON)   > b.top);
  } else {
    return ((a.left - margin.horizontal + EPSILON)   < (b.left + b.width) &&
    (a.left + a.width + margin.horizontal - EPSILON) > b.left &&
    (a.top - margin.vertical + EPSILON)              < (b.top + b.height) &&
    (a.top + a.height + margin.vertical - EPSILON)   > b.top);
  }
}

/**
 * Test if the two provided objects collide
 * The objects must have parameters start, end, top, and height.
 * @param {Object} a          The first Object
 * @param {Object} b          The second Object
 * @return {boolean}        true if a and b collide, else false
 */
export function collisionByTimes(a, b) {

  // Check for overlap by time and height. Abutting is OK and
  // not considered a collision while overlap is considered a collision.
  const timeOverlap = a.start < b.end && a.end > b.start;
  const heightOverlap = a.top < (b.top + b.height) && (a.top + a.height) > b.top;
  return timeOverlap && heightOverlap;
}



/**
 * Reusable stacking function
 * 
 * @param {Item[]} items 
 * An array of items to consider during stacking.
 * @param {{horizontal: number, vertical: number}} margins
 * Margins to be used for collision checking and placement of items.
 * @param {boolean} compareTimes
 * By default, horizontal collision is checked based on the spatial position of the items (left/right and width).
 * If this argument is true, horizontal collision will instead be checked based on the start/end times of each item.
 * Vertical collision is always checked spatially.
 * @param {(Item) => number | null} shouldStack
 * A callback function which is called before we start to process an item. The return value indicates whether the item will be processed.
 * @param {(Item) => boolean} shouldOthersStack
 * A callback function which indicates whether other items should consider this item when being stacked.
 * @param {(Item) => number} getInitialHeight
 * A callback function which determines the height items are initially placed at
 * @param {() => boolean} shouldBail 
 * A callback function which should indicate if the stacking process should be aborted.
 * 
 * @returns {null|number}
 * if shouldBail was triggered, returns null
 * otherwise, returns the maximum height
 */
function performStacking(items, margins, compareTimes, shouldStack, shouldOthersStack, getInitialHeight, shouldBail) {
  // Time-based horizontal comparison
  let getItemStart = item => item.start;
  let getItemEnd = item => item.end;
  if(!compareTimes) {
    // Spatial horizontal comparisons
    const rtl = !!(items[0] && items[0].options.rtl);
    if(rtl) {
      getItemStart = item => item.right;
    } else {
      getItemStart = item => item.left;
    }
    getItemEnd = item => getItemStart(item) + item.width + margins.horizontal;
  }


  const itemsToPosition = [];
  const itemsAlreadyPositioned = [];
  for (var i = 0; i < items.length; i++) {
    if(shouldStack(items[i])) {
      items[i].top = null;
      itemsToPosition.push(items[i]);
    } else if (shouldOthersStack(items[i])) {
      itemsAlreadyPositioned.push(items[i]);
    }
  }


  let maxHeight = 0;


  // calculate new, non-overlapping positions
  for (i = 0; i < itemsToPosition.length; i++) {
    const item = itemsToPosition[i];


    if (shouldStack(item)) {
      // initialize top position
      item.top = getInitialHeight(item);


      const horizontallyCollidingItems = [];
      for (let j = 0, jj = itemsAlreadyPositioned.length; j < jj; j++) {
        // TODO: optimize checking for overlap. when there is a gap without items,
        //       you only need to check for items from the next item on, not from zero


        const other = itemsAlreadyPositioned[j];


        const itemsCollideHorizontally = getItemStart(item) < getItemEnd(other) - EPSILON && getItemEnd(item) - EPSILON > getItemStart(other);
        if (itemsCollideHorizontally) {
          horizontallyCollidingItems.push(other);
        }
      }
      horizontallyCollidingItems.sort((a, b) => a.top - b.top);


      for(let i2 = 0; i2 < horizontallyCollidingItems.length; i2++) {
        const other = horizontallyCollidingItems[i2];

        const itemsCollideVertically = item.top < (other.top + other.height + margins.vertical) && (item.top + item.height + margins.vertical) > other.top;
        if (itemsCollideVertically) {
          item.top = other.top + other.height + margins.vertical;
        }
      }

      // Keep track of the tallest item we've seen before
      const currentHeight = item.top + item.height;
      if(currentHeight > maxHeight) {
        maxHeight = currentHeight;
      }


      if (shouldOthersStack(item)) {
        itemsAlreadyPositioned.push(item);
      }
    }


    if (shouldBail && shouldBail()) { return null; }
  }


  return maxHeight;
}