<template>
  <div>
    <div v-for="id in orderedIds" :key="id"
      style="margin-bottom: 3em;">
      <strong style="font-size: medium;">
        <span style="user-select: none;">&gt; </span>{{ displayExternalCommands[id].cmd }}
      </strong>
      <div style="margin-left: 2em">
        <pre v-if="displayExternalCommands[id].result"
            style="background-color: #fafafa; max-height: 10em;"
            :style="displayExternalCommands[id].result.returncode ? 'color: darkred' : ''"
            ref="outputs"
        >{{ displayExternalCommands[id].output }}</pre>
        <router-link
          v-else
          :to="getLiveFileRoute(displayExternalCommands[id].file, displayExternalCommands[id].host)"
          class="btn btn-primary" style="margin: 1em 0;">
          <font-awesome-icon :icon="['far', 'eye']"></font-awesome-icon>
          View Live Output
        </router-link>
        <div class="row" style="margin-left: 2em">
            <div class="col-md-2">
              <strong>time: </strong> {{ displayExternalCommands[id].duration }}
            </div>

          <div v-if="!displayExternalCommands[id].result" class="col-md-2" style="color: #07d">
            <font-awesome-icon icon="circle-notch" class="fa-spin">
            </font-awesome-icon> running
          </div>
          <div v-else-if="displayExternalCommands[id].result.timeout"
               class="col-md-2 result-warning">
            <strong>completion timeout exceeded</strong>
          </div>
          <div v-else-if="displayExternalCommands[id].result.inactive"
               class="col-md-2 result-warning">
            <strong>inactivity (no output) timeout</strong>
          </div>
          <div v-else-if="displayExternalCommands[id].result.returncode"
               class="col-md-2" style="color: darkred">
            <strong>returncode: </strong> {{displayExternalCommands[id].result.returncode}}
          </div>
          <div v-else-if="displayExternalCommands[id].result.returncode === 0" class="col-md-2">
            <strong style="color: darkgreen;">success</strong>
          </div>

          <div class="col-md-4">
            <strong>started: </strong> {{ displayExternalCommands[id].startTime }}
          </div>
          <div v-if="displayExternalCommands[id].taskLogLink" class="col-md-4">
            <a :href="displayExternalCommands[id].taskLogLink">
              <font-awesome-icon icon="file-alt"></font-awesome-icon>
              View in Task Log
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { DateTime } from 'luxon';
import _ from 'lodash';
import { mapGetters } from 'vuex';
import { durationString } from '../utils';

export default {
  name: 'XExternalCommands',
  props: {
    externalCommands: { required: true, type: Object },
    taskLogsUrl: { required: false, default: null },
  },
  mounted() {
    // Scroll output elements to bottom.
    _.each(_.get(this.$refs, 'outputs', []), (o) => { o.scrollTop = o.scrollHeight; });
  },
  computed: {
    ...mapGetters({
      getLiveFileRoute: 'header/getLiveFileRoute',
    }),
    displayExternalCommands() {
      return _.mapValues(this.externalCommands, (c, id) => ({
        cmd: this.formatCommand(c.cmd),
        result: c.result,
        output: this.formatOutput(c),
        duration: this.commandDuration(c),
        startTimeEpoch: c.start_time,
        startTime: this.formatTime(c.start_time),
        taskLogLink: this.taskLogsUrl ? `${this.taskLogsUrl}#${id}` : null,
        host: c.host,
        file: c.output_file,
      }));
    },
    orderedIds() {
      return _.sortBy(_.keys(this.externalCommands), k => this.externalCommands[k].start_time);
    },
  },
  methods: {
    escapeCmdPart(cmdPart) {
      if (this.hasWhiteSpace(cmdPart)) {
        const escapedCmdPart = cmdPart.replace(/"/g, '\\"').replace(/'/g, "\\'");
        return `"${escapedCmdPart}"`;
      }
      return cmdPart;
    },
    hasWhiteSpace(s) {
      return /\s/g.test(s) || /'/g.test(s) || /"/g.test(s);
    },
    formatCommand(cmd) {
      if (_.isArray(cmd)) {
        return _.join(_.map(cmd, this.escapeCmdPart), ' ');
      }
      return cmd;
    },
    formatTime(unixTime) {
      return DateTime.fromSeconds(unixTime).toLocaleString(DateTime.DATETIME_FULL);
    },
    timeAgo(time) {
      return durationString(_.max([(Date.now() / 1000) - time, 0]));
    },
    commandDuration(cmd) {
      if (_.has(cmd, 'end_time')) {
        return durationString(cmd.end_time - cmd.start_time);
      }
      return this.timeAgo(cmd.start_time);
    },
    formatOutput(cmd) {
      if (!_.has(cmd, 'result.output')) {
        return null;
      }
      if (_.isNil(cmd.result.output)) {
        return '<output not captured>';
      }
      if (cmd.result.output === '') {
        return '<no output>';
      }
      if (cmd.result.output_truncated) {
        return `<truncated>\n...${cmd.result.output}`;
      }
      return cmd.result.output;
    },
  },
};
</script>

<style scoped>

.result-warning {
  color: darkorange;
}

</style>