#version 300 es
      precision highp float;

      in vec2 v_texCoord;
      out vec4 fragColor;

      uniform sampler2D u_textureA;      // outgoing frame (already processed)
      uniform sampler2D u_textureB;      // incoming frame (already processed)
      uniform float u_progress;          // 0.0 = fully outgoing, 1.0 = fully incoming
      uniform int u_transitionType;      // 0=crossfade, 1=dissolve, 2-5=wipes

      void main() {
        vec4 a = texture(u_textureA, v_texCoord);
        vec4 b = texture(u_textureB, v_texCoord);

        vec4 blended;
        if (u_transitionType == 0) {
          // Crossfade: linear interpolation
          blended = mix(a, b, u_progress);
        } else if (u_transitionType == 1) {
          // Dissolve: noise-based threshold
          float noise = fract(sin(dot(v_texCoord, vec2(12.9898, 78.233))) * 43758.5453);
          blended = noise < u_progress ? b : a;
        } else if (u_transitionType == 2) {
          // Wipe left: incoming appears from left
          blended = v_texCoord.x < u_progress ? b : a;
        } else if (u_transitionType == 3) {
          // Wipe right: incoming appears from right
          blended = v_texCoord.x > (1.0 - u_progress) ? b : a;
        } else if (u_transitionType == 4) {
          // Wipe up: incoming appears from bottom
          blended = (1.0 - v_texCoord.y) < u_progress ? b : a;
        } else if (u_transitionType == 5) {
          // Wipe down: incoming appears from top
          blended = v_texCoord.y < u_progress ? b : a;
        } else {
          // Fallback: crossfade
          blended = mix(a, b, u_progress);
        }

        fragColor = blended;
      }
