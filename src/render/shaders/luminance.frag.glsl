#version 300 es
      precision highp float;
      in vec2 v_texCoord;
      out vec4 fragColor;
      uniform sampler2D u_texture;

      // Input transfer function: 0=sRGB/linear, 1=HLG, 2=PQ
      uniform int u_inputTransfer;

      // Rec. 709 luminance coefficients
      const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

      // Input decodes mirror viewer.frag.glsl so the statistics describe the
      // same linear values the viewer pipeline works on (1.0 = 203 cd/m² for
      // both HLG and PQ). Keep in sync with hlgToLinear / pqToLinear there.
      const float HDR_REFERENCE_WHITE_NITS = 203.0;
      const float HLG_NOMINAL_PEAK_NITS = 1000.0;
      const vec3 LUMA_BT2020 = vec3(0.2627, 0.6780, 0.0593);
      const float HLG_OOTF_THRESH = 0.01;
      const float HLG_OOTF_SLOPE = 39.810717;

      // HLG OETF^-1 (signal -> scene linear)
      float hlgOETFInverse(float e) {
        const float a = 0.17883277;
        const float b = 0.28466892;
        const float c = 0.55991073;
        if (e <= 0.5) {
          return (e * e) / 3.0;
        } else {
          return (exp((e - c) / a) + b) / 12.0;
        }
      }

      vec3 hlgToLinear(vec3 signal) {
        vec3 scene = vec3(hlgOETFInverse(signal.r), hlgOETFInverse(signal.g), hlgOETFInverse(signal.b));
        float ys = dot(scene, LUMA_BT2020);
        float ootfGain = (ys < HLG_OOTF_THRESH) ? ys * HLG_OOTF_SLOPE : pow(ys, 0.2);
        return scene * ootfGain * (HLG_NOMINAL_PEAK_NITS / HDR_REFERENCE_WHITE_NITS);
      }

      // PQ EOTF (signal -> absolute linear, 1.0 = 10000 cd/m²)
      float pqEOTF(float e) {
        const float m1 = 0.1593017578125;
        const float m2 = 78.84375;
        const float c1 = 0.8359375;
        const float c2 = 18.8515625;
        const float c3 = 18.6875;
        float p = pow(max(e, 0.0), 1.0 / m2);
        float num = max(p - c1, 0.0);
        float den = c2 - c3 * p;
        return pow(num / max(den, 1e-10), 1.0 / m1);
      }

      void main() {
        vec4 texel = texture(u_texture, v_texCoord);
        vec3 color = texel.rgb;

        // Apply input EOTF to get linear light
        if (u_inputTransfer == 1) {
          color = hlgToLinear(color);
        } else if (u_inputTransfer == 2) {
          color = vec3(pqEOTF(color.r), pqEOTF(color.g), pqEOTF(color.b)) * (10000.0 / HDR_REFERENCE_WHITE_NITS);
        }

        float luminance = dot(color, LUMA);

        // Output log-luminance in R channel, raw luminance in G channel (mipmap LINEAR averages both)
        float logLum = log(luminance + 1e-6);
        fragColor = vec4(logLum, luminance, 0.0, 1.0);
      }
