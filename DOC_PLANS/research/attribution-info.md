# OpenRV Attribution Information -- Research Notes

## Source
- LICENSE URL: https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenRV/main/LICENSE
- NOTICE URL: https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenRV/main/Notice.txt
- License: Apache 2.0

## License Type
**Apache License, Version 2.0, January 2004**

The OpenRV code base is "licensed pursuant to Apache 2.0, except as otherwise required by the specific licenses of components of the code base."

## Key Apache 2.0 Requirements

### For Documentation Reuse
Under Apache 2.0, documentation is considered part of the "Work" and can be used under these terms:
1. **Attribution required**: Must retain copyright notices and give credit to the original project
2. **State changes**: Must note any modifications made to original content
3. **License notice**: Must include a copy of the license or reference to it
4. **NOTICE file**: Must include contents of NOTICE file if one exists (it does: Notice.txt)

### Redistribution Rules
- May reproduce and distribute copies of the Work or Derivative Works in any medium
- Must give recipients a copy of the License
- Must cause modified files to carry prominent notices stating changes
- Must retain all copyright, patent, trademark, and attribution notices from Source form

### What This Means for OpenRV Web Documentation
- Documentation that adapts concepts from OpenRV docs should:
  - Credit "Academy Software Foundation OpenRV" as the source of adapted concepts
  - Note that the documentation has been adapted for the web implementation
  - Include Apache 2.0 license reference
  - Not claim to be official OpenRV documentation

## NOTICE File Content (Notice.txt)
The Notice.txt file lists third-party components NOT licensed under Apache 2.0:

### Listed Components (BSD-style licenses)
- **OpenEXR** - Copyright (c) 2006-2019 OpenEXR, LF Projects LLC (3-clause BSD)
- **Imath** - Copyright Contributors to OpenEXR Project (3-clause BSD)
- **libjpeg-turbo v2.1.4** - IJG License + Modified BSD + zlib License

These third-party notices apply to the OpenRV software itself, not necessarily to its documentation. However, if OpenRV Web uses any of these libraries, their license requirements must be met independently.

## Attribution Requirements for OpenRV Web Documentation

### Recommended Attribution Block
For any documentation that adapts OpenRV concepts:
```
Portions of this documentation are adapted from the OpenRV User Manual and
Reference Manual, Copyright Academy Software Foundation, licensed under
Apache License 2.0. This documentation describes OpenRV Web, an independent
web-based implementation, and is not affiliated with or endorsed by the
Academy Software Foundation.
```

### Key Points
- The formulas (CDL, saturation, contrast, transfer functions) are mathematical/scientific facts and not copyrightable
- Pipeline concepts and terminology can be freely referenced with attribution
- Exact prose from the original docs should be paraphrased rather than copied verbatim
- Node names, property names, and technical terms are factual and can be referenced
