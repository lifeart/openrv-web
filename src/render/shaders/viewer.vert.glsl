#version 300 es
      in vec2 a_position;
      in vec2 a_texCoord;
      out vec2 v_texCoord;
      uniform vec2 u_offset;
      uniform vec2 u_scale;
      uniform int u_texRotation; // 0=0°, 1=90°CW, 2=180°, 3=270°CW
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

        // Step 2: Apply rotation (video rotation + user rotation combined)
        if (u_texRotation == 1) {
          tc = vec2(tc.y, 1.0 - tc.x);       // 90° CW
        } else if (u_texRotation == 2) {
          tc = vec2(1.0 - tc.x, 1.0 - tc.y); // 180°
        } else if (u_texRotation == 3) {
          tc = vec2(1.0 - tc.y, tc.x);        // 270° CW
        }
        v_texCoord = tc;
      }
