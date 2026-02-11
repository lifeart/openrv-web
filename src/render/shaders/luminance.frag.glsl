#version 300 es
      precision highp float;
      in vec2 v_texCoord;
      out vec4 fragColor;
      uniform sampler2D u_texture;

      // Input transfer function: 0=sRGB/linear, 1=HLG, 2=PQ
      uniform int u_inputTransfer;

      // Rec. 709 luminance coefficients
      const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

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

      // PQ EOTF (signal -> display linear, normalized to [0,1])
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
          color = vec3(hlgOETFInverse(color.r), hlgOETFInverse(color.g), hlgOETFInverse(color.b));
        } else if (u_inputTransfer == 2) {
          color = vec3(pqEOTF(color.r), pqEOTF(color.g), pqEOTF(color.b));
        }

        float luminance = dot(color, LUMA);

        // Output log-luminance in R channel, raw luminance in G channel (mipmap LINEAR averages both)
        float logLum = log(luminance + 1e-6);
        fragColor = vec4(logLum, luminance, 0.0, 1.0);
      }
