#version 300 es
      in vec2 a_position;
      in vec2 a_texCoord;
      out vec2 v_texCoord;
      uniform vec2 u_offset;
      uniform vec2 u_scale;
      uniform mat2 u_texRotationMatrix; // 2x2 rotation matrix (replaces integer u_texRotation)
      uniform int u_texFlipH;    // 0=no flip, 1=flip horizontally
      uniform int u_texFlipV;    // 0=no flip, 1=flip vertically

      void main() {
        vec2 pos = a_position * u_scale + u_offset;
        gl_Position = vec4(pos, 0.0, 1.0);

        // Apply texture transforms: flip first, then rotation
        // (matches canvas 2D path ordering: ctx.rotate() then ctx.scale())
        vec2 tc = a_texCoord;

        // Step 1: Apply flip
        if (u_texFlipH == 1) tc.x = 1.0 - tc.x;
        if (u_texFlipV == 1) tc.y = 1.0 - tc.y;

        // Step 2: Apply rotation via matrix (replaces 4-branch if/else)
        vec2 centered = tc - 0.5;
        tc = u_texRotationMatrix * centered + 0.5;

        v_texCoord = tc;
      }
