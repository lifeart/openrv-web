#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_baseTexture;   // accumulated result so far (linear space)
uniform sampler2D u_layerTexture;  // current layer to composite (linear space)
uniform int u_compositeMode;       // compositing operation
uniform float u_opacity;           // layer opacity (0-1)
uniform bool u_premultiplied;      // premultiplied alpha mode

// Stencil box clipping [xMin, xMax, yMin, yMax] in normalized coords
uniform vec4 u_stencilBox;
uniform bool u_stencilEnabled;

// Blend mode constants (Release 1: Over, Replace, Add, Difference)
const int MODE_OVER       = 0;
const int MODE_REPLACE    = 1;
const int MODE_ADD        = 2;
const int MODE_DIFFERENCE = 3;

// Blend operations work on UNPREMULTIPLIED (straight) color values.
vec3 blendColors(vec3 base, vec3 layer, int mode) {
    if (mode == MODE_REPLACE || mode == MODE_OVER) {
        return layer;
    } else if (mode == MODE_ADD) {
        return base + layer;
    } else if (mode == MODE_DIFFERENCE) {
        return abs(base - layer);
    }
    return layer; // fallback
}

void main() {
    // Stencil box clipping
    if (u_stencilEnabled) {
        if (v_texCoord.x < u_stencilBox.x || v_texCoord.x > u_stencilBox.y ||
            v_texCoord.y < u_stencilBox.z || v_texCoord.y > u_stencilBox.w) {
            // Outside stencil: pass through base unchanged
            fragColor = texture(u_baseTexture, v_texCoord);
            return;
        }
    }

    vec4 base = texture(u_baseTexture, v_texCoord);
    vec4 layer = texture(u_layerTexture, v_texCoord);

    // Apply layer opacity
    float layerAlpha = layer.a * u_opacity;

    // Replace: just overwrite (no alpha blending)
    if (u_compositeMode == MODE_REPLACE) {
        fragColor = vec4(layer.rgb, layerAlpha);
        return;
    }

    // For non-Over blend modes in premultiplied space, we must unpremultiply
    // before blending and repremultiply after.
    vec3 baseColor = base.rgb;
    vec3 layerColor = layer.rgb;

    if (u_premultiplied) {
        // Unpremultiply for blending (avoid division by zero)
        if (base.a > 0.001) {
            baseColor = base.rgb / base.a;
        }
        if (layer.a > 0.001) {
            layerColor = layer.rgb / layer.a;
        }
    }

    // Compute blended color (operates on straight/unpremultiplied values)
    vec3 blended = blendColors(baseColor, layerColor, u_compositeMode);

    if (u_premultiplied) {
        // Premultiplied alpha compositing (OpenRV default)
        float outA = layerAlpha + base.a * (1.0 - layerAlpha);
        // Repremultiply the blended result
        vec3 outRGB = blended * layerAlpha + baseColor * base.a * (1.0 - layerAlpha);
        fragColor = vec4(outRGB, outA);
    } else {
        // Straight alpha compositing
        float outA = layerAlpha + base.a * (1.0 - layerAlpha);
        if (outA > 0.0) {
            vec3 outRGB = (blended * layerAlpha + base.rgb * base.a * (1.0 - layerAlpha)) / outA;
            fragColor = vec4(outRGB, outA);
        } else {
            fragColor = vec4(0.0);
        }
    }
}
