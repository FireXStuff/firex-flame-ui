<template>
  <!-- always have a margin to keep front nodes centered, regardless to if either front node
      has stacked boxes behind it. -->
  <div :style="{'margin-left': allStackOffset + 'px', 'display': 'inline-block'}">
    <div :style="frontBoxStyle">
        <x-task-node
          :node="node"
          :showUuid="showUuid"
          :liveUpdate="liveUpdate"
          :style="frontTaskStyle"
          :areAllChildrenCollapsed="areAllChildrenCollapsed"
          :displayDetails="displayDetails"></x-task-node>
    </div>

    <div v-if="hasCollapsedChildren"
         :style="stacksContainerStyle" class="stacks-link" @click="expandAll">
      <div v-for="i in collapseDetails.stackCount" :key="i"
           class="stacked-effect" :style="getNonFrontBoxStyle(i-1)">
      </div>
      <div class="stacks-count">
        {{collapseDetails.collapsedUuids.length}}
        {{collapseDetails.collapsedUuids.length === 1 ? 'Task' : 'Tasks'}}
      </div>
    </div>
  </div>
</template>

<script>
import _ from 'lodash';
import { eventHub, createCollapseEvent, containsAll, getTaskNodeBorderRadius } from '../../utils';
import XTaskNode from './XTaskNode.vue';

export default {
  name: 'XSvgCollapseNode',
  components: { XTaskNode },
  props: {
    node: { type: Object, required: true },
    showUuid: {},
    dimensions: { required: true, type: Object },
    liveUpdate: { required: true, type: Boolean },
    collapseDetails: { required: true, type: Object },
    displayDetails: { required: true },
  },
  computed: {
    areAllChildrenCollapsed() {
      return containsAll(this.collapseDetails.collapsedUuids,
        this.node.children_uuids);
    },
    hasCollapsedChildren() {
      return this.collapseDetails.collapsedUuids.length > 0;
    },
    allStackOffset() {
      return this.collapseDetails.stackCount * this.collapseDetails.stackOffset;
    },
    boxDimensions() {
      // 2x since we pad both sides of width.
      const width = this.dimensions.width - this.allStackOffset * 2;
      const height = this.dimensions.height - this.allStackOffset;
      return { width, height };
    },
    frontBoxStyle() {
      return {
        width: `${this.boxDimensions.width}px`,
        height: `${this.boxDimensions.height}px`,
        'border-right': this.hasCollapsedChildren ? '0.5px solid white' : '',
        'border-bottom': this.hasCollapsedChildren ? '0.5px solid white' : '',
        // TODO: avoid having this component know about how tasks represent chain depth.
        'border-radius': getTaskNodeBorderRadius(this.node.chain_depth),
      };
    },
    frontTaskStyle() {
      return {
        width: `${this.boxDimensions.width}px`,
        height: `${this.boxDimensions.height}px`,
      };
    },
    stacksContainerStyle() {
      const offsets = (this.collapseDetails.stackCount - 1) * this.collapseDetails.stackOffset;
      return _.merge(this.getNonFrontBoxMargins(1), {
        width: `${this.boxDimensions.width + offsets}px`,
        height: `${this.boxDimensions.height + offsets}px`,
      });
    },
  },
  methods: {
    emitExpandUuids(uuids) {
      // TODO: is this better than an expand descendants? Seems like unnecessary ops.
      const expandDescendantEvents = createCollapseEvent(uuids, 'expand', 'self');
      eventHub.$emit('ui-collapse', {
        keep_rel_position_task_uuid: this.node.uuid,
        operationsByUuid: expandDescendantEvents,
      });
    },
    getNonFrontBoxMargins(level) {
      return {
        // One pixel to offset for border.
        'margin-top': `${this.collapseDetails.stackOffset * level}px`,
        'margin-left': `${this.collapseDetails.stackOffset * level}px`,
      };
    },
    getNonFrontBoxStyle(level) {
      let background;
      if (level < this.collapseDetails.backgrounds.length) {
        background = this.collapseDetails.backgrounds[level];
      } else {
        background = _.first(this.collapseDetails.backgrounds);
      }

      return _.merge(this.getNonFrontBoxMargins(level),
        {
          background,
          'z-index': -(level + 1),
          width: `${this.boxDimensions.width}px`,
          height: `${this.boxDimensions.height}px`,
        });
    },
    expandAll() {
      this.emitExpandUuids(this.collapseDetails.collapsedUuids);
    },
  },
};

</script>

<style scoped>

  .stacked-effect {
    border: 0.5px solid white;
    border-radius: 8px;
    position: absolute;
    top: 0;
  }

  .stacks-link:hover .stacked-effect {
    cursor: pointer;
    background: black !important;
  }

  .stacks-link {
    position: absolute;
    top: 0;
    z-index: -1;
    display: inline-block;
  }

  .stacks-link:hover .stacks-count {
    cursor: pointer;
  }

  .stacks-count {
    position: absolute;
    bottom: 9px; /* TODO: fix hack. should be calced from offset? */
    text-align: center;
    width: 100%;
    color: white;
    font-size: 14px;
    font-family: 'Source Sans Pro', sans-serif;
  }

</style>