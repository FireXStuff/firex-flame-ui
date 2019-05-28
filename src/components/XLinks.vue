<template>
  <g>
    <path class="link" v-for="l in parentChildLinks" :d="l.d" :key="l.id"></path>
    <!--<path class="chain-link" v-for="l in chainLinks" :d="l.d" :key="l.id"-->
          <!--stroke-dasharray="5,5"></path>-->
    <!--<defs>-->
      <!--<pattern id="link" x="0" y="0" width="1" height="1">-->
       <!--<font-awesome-icon icon="link" x="0" y="0" width="50" height="50"-->
                          <!--:transform="{ rotate: 45 }"></font-awesome-icon>-->
      <!--</pattern>-->
    <!--</defs>-->
    <!--<rect v-for="l in chainLinks" :key="l.id"-->
      <!--fill="url(#link)"-->
      <!--:width="l.width" :x="l.x" :y="l.y"-->
      <!--height="3em"/>-->

    <font-awesome-icon v-for="l in chainLinks" :key="l.id" :transform="{ rotate: 45 }"
                       icon="link" :x="l.x" :y="l.y" :width="l.width" height="3em" fixed-width>
    </font-awesome-icon>
  </g>
</template>

<script>
import _ from 'lodash';

export default {
  name: 'XLinks',
  props: {
    parentUuidByUuid: { required: true, type: Object },
    nodeLayoutsByUuid: { required: true, type: Object },
  },
  computed: {
    chainsByUuid() {
      return this.$store.getters['tasks/chainsByUuid'];
    },
    parentChildLinks() {
      const links = [];
      // We only want to show links for nodes with a layout.
      _.each(this.nodeLayoutsByUuid, (childLayout, cUuid) => {
        const parentId = this.parentUuidByUuid[cUuid];
        if (!_.isNull(parentId) && _.has(this.nodeLayoutsByUuid, parentId)) {
          const parentLayout = this.nodeLayoutsByUuid[parentId];
          const pXCenter = parentLayout.x + parentLayout.width / 2;
          // Horizontal line between the horizontal-centers of the two nodes.
          const horzDistance = (childLayout.x + childLayout.width / 2) - pXCenter;
          const pBottom = parentLayout.y + parentLayout.height;
          // Vertical line half the vertical distance between the two nodes.
          const halfVerticalDistance = (childLayout.y - parentLayout.y - parentLayout.height) / 2;

          const d = `M${pXCenter} ${pBottom}`
            + ` v ${halfVerticalDistance}`
            + `h ${horzDistance}`
            + `v ${halfVerticalDistance}`;

          links.push({ d, id: `${parentId}->${cUuid}` });
        }
      });
      return links;
    },
    visiblePrevChainEntryByUuid() {
      return _.omitBy(
        _.mapValues(this.chainsByUuid, (chainEntry, uuid) => {
          if (!_.has(this.nodeLayoutsByUuid, uuid)) {
            return null;
          }
          let prevUuid = chainEntry.prev_chain_entry;
          // Find nearest visible previous chain entry.
          while (prevUuid && !_.has(this.nodeLayoutsByUuid, prevUuid)
                  && _.has(this.chainsByUuid, prevUuid)) {
            prevUuid = this.chainsByUuid[prevUuid].prev_chain_entry;
          }
          if (_.has(this.nodeLayoutsByUuid, prevUuid)) {
            return prevUuid;
          }
          return null;
        }),
        _.isNull,
      );
    },
    chainLinks() {
      // We only want to show links between chain nodes that have a layout.
      return _.map(this.visiblePrevChainEntryByUuid, (visiblePreUuid, uuid) => {
        const leftLayout = this.nodeLayoutsByUuid[visiblePreUuid];
        const rightLayout = this.nodeLayoutsByUuid[uuid];

        const x = leftLayout.x + leftLayout.width;
        const yOffset = 20;
        const y = leftLayout.y - yOffset + _.min([leftLayout.height, rightLayout.height]) / 2;
        const width = rightLayout.x - x;
        // const d = `M${x} ${y} h ${width}`;
        return {
          x, y, width, id: `${visiblePreUuid}->${uuid}`,
        };
      });
    },
  },
};
</script>

<style scoped>

.link {
  fill: none;
  stroke: #000; /*#ccc; */
  stroke-width: 2px; /*4px;*/
}

.chain-link {
  fill: none;
  stroke: blue;
  stroke-width: 2px;
}

svg text {
   font-family: FontAwesome;
}

</style>
