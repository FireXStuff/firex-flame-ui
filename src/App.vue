<template>
  <div id="app">
    <router-view/>
  </div>
</template>

<script>
export default {
  name: 'App',
};
</script>

<style>

  body {
    margin: 0;
  }

  html, body {
    margin: 0;
    height: 100%; /* can also use viewport units (height: 100vh) */
  }
  #app { height: 100%;}

  @keyframes spinner {
    to {
      transform: rotate(360deg);
    }
  }

  .spinner:before {
    content: '';
    box-sizing: border-box;
    position: absolute;
    top: 50%;
    left: 50%;
    width: 20px;
    height: 20px;
    margin-top: -10px;
    margin-left: -10px;
    border-radius: 50%;
    border-top: 2px solid #07d;
    border-right: 2px solid transparent;
    animation: spinner .6s linear infinite;
  }

  a.subtle-link {
    color: inherit;
  }

  a.subtle-link:hover {
    cursor: pointer;
  }

  .flame-top {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .flame-container {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }

  .node-attributes-label {
  font-weight: 700;
}

.node-attributes {
  font-family: 'Source Code Pro', monospace;
  font-size: 14px;
  margin: 10px;
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

</style>
