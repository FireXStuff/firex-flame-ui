<template>
  <div class="flame-top">
    <x-header :title="firexId" :mainTitle="title" :links="headerLinks">
    </x-header>
    <div v-on:scroll="onScroll" class="content flame-container" ref="viewer_div">
      <template v-if="isLiveFileListenSupported">
        <span v-for="(line, i) in lines" :key="i" class="thin">{{line}}</span>
      </template>
      <div v-else>
        Live file viewing is no longer available for this FireX run.
      </div>
    </div>
    <transition name="fade">
      <div v-if="!inSync " style="position: absolute; bottom: 15px; left: 50%;">
        <button v-on:click="syncClicked" class="btn btn-primary">
          <font-awesome-icon icon="arrow-down" style="margin-right: 10px;"/>
          Sync scroll
          <font-awesome-icon icon="arrow-down" style="margin-left: 10px;"/>
        </button>
      </div>
    </transition>
    <div v-if="showSpinner" class="no_data_yet">
      <div class="spinner"></div>
      <div style="margin-top: 50px;">
        Waiting for data
      </div>
    </div>
  </div>
</template>

<script>
import { mapGetters } from 'vuex';
import * as api from '../api';
import XHeader from './XHeader.vue';

export default {
  name: 'XLiveFileViewer',
  components: { XHeader },
  props: {
    host: { type: String },
    filepath: { type: String },
  },
  data() {
    return {
      isLiveFileListenSupported: api.isLiveFileListenSupported(),
      lines: [],
      inSync: true,
      internalScroll: true,
      oldScrollTop: 0,
      showSpinner: true,
    };
  },
  created() {
    api.startLiveFileListen(this.host, this.filepath, this.addNewChunk);
    window.addEventListener('beforeunload', api.stopLiveFileListen);
  },
  destroyed() {
    window.removeEventListener('beforeunload', api.stopLiveFileListen);
  },
  computed: {
    ...mapGetters({
      graphViewHeaderEntry: 'header/graphViewHeaderEntry',
      helpViewHeaderEntry: 'header/helpViewHeaderEntry',
    }),
    title() {
      return `Monitoring ${this.host}:${this.filepath}`;
    },
    firexId() {
      return this.$store.state.firexRunMetadata.uid;
    },
    headerLinks() {
      return [this.graphViewHeaderEntry, this.helpViewHeaderEntry];
    },
  },
  methods: {
    addNewChunk(input) {
      this.lines.push(input);
      this.showSpinner = false;
      this.$nextTick(() => {
        this.scrollSync();
      });
    },
    syncClicked() {
      this.inSync = true;
      this.scrollSync();
    },
    scrollSync() {
      if (this.$refs.viewer_div) {
        const v = this.$refs.viewer_div;
        if (this.inSync) {
          this.internalScroll = true;
          v.scrollTop = v.scrollHeight;
        }
      }
    },
    unSync() {
      this.inSync = false;
    },
    onScroll() {
      if (this.$refs.viewer_div) {
        const v = this.$refs.viewer_div;
        if (v.scrollTop === this.oldScrollTop) {
          return;
        }
        this.oldScrollTop = v.scrollTop;
      }
      if (this.internalScroll) {
        this.internalScroll = false;
      } else {
        this.unSync();
      }
    },
  },
  beforeRouteLeave(to, from, next) {
    api.stopLiveFileListen();
    next();
  },
};
</script>

<style scoped>

.content {
  font-family: Consolas, monaco, monospace;
  padding: 1em;
  min-height: 2em;
  white-space: pre;
}
.no_data_yet {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
.thin {
  margin: 0;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 1s;
}
.fade-enter,
.fade-leave-to
/* .fade-leave-active in <2.1.8 */
{
  opacity: 0;
}
</style>
