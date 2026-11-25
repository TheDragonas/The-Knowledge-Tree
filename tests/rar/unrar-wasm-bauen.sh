#!/bin/sh
# Baut einen Nachbau von node-unrar-js 2.0.2 (offizielles unrar 6.1.7 als WASM) für Browser-Tests OHNE Internet-CDN.
# Ergebnis: $OUT/esm/nur.mjs (+ js/unrar.js, js/unrar.wasm) – im Test per Playwright-Route statt jsDelivr ausliefern:
#   https://cdn.jsdelivr.net/npm/node-unrar-js@2.0.2/+esm        → esm/nur.mjs
#   https://cdn.jsdelivr.net/npm/node-unrar-js@2.0.2/js/unrar.js → esm/js/unrar.js
#   …/dist/js/unrar.wasm                                         → esm/js/unrar.wasm
# Braucht: git, python3, node ≥ 22.13 (stripTypeScriptTypes), cmake, ninja, clang/LLVM 18 (wasm-ld), Zugriff auf github.com.
set -e
W=${W:-/tmp/unrar-wasm}; OUT=${OUT:-$W/out}; LLVM=${LLVM:-/usr/lib/llvm-18/bin}
mkdir -p $W && cd $W
[ -d emsc ] || git clone -q --depth 1 --branch 3.1.50 https://github.com/emscripten-core/emscripten.git emsc
[ -d binaryen ] || git clone -q --depth 1 --branch version_115 https://github.com/WebAssembly/binaryen.git binaryen
[ -d unrar-src ] || git clone -q https://github.com/pmachapman/unrar.git unrar-src          # Spiegel der rarlab-Quellen
[ -d nur ] || git clone -q --depth 1 https://github.com/YuJianrong/node-unrar.js.git nur
[ -f binaryen/build/bin/wasm-opt ] || (mkdir -p binaryen/build && cd binaryen/build && cmake -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTS=OFF -DENABLE_WERROR=OFF -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++ .. >/dev/null && ninja wasm-opt wasm-metadce wasm-emscripten-finalize wasm-split wasm-ctor-eval wasm2js)
# emscripten ohne npm: Einstiegspunkte erzeugen, Bootstrap-Stempel setzen, acorn verlinken (falls vorhanden)
printf "LLVM_ROOT = '%s'\nBINARYEN_ROOT = '%s'\nNODE_JS = '%s'\n" "$LLVM" "$W/binaryen/build" "$(command -v node)" > emsc/.emscripten
(cd emsc && python3 tools/maint/create_entry_points.py && mkdir -p out node_modules && for n in npm_packages create_entry_points git_submodules; do echo s > out/$n.stamp; done)
[ -e emsc/node_modules/acorn ] || for a in /opt/node-tools/node_modules/acorn /opt/npm-tools/node_modules/acorn "$(npm root -g 2>/dev/null)/acorn"; do [ -d "$a" ] && ln -sf "$a" emsc/node_modules/acorn && break; done
# Quellen wie in node-unrar-js (src/build/make.ts): unrar 6.1.7 („Updated to 6.1.7“) + Bridge
rm -rf b && mkdir -p b/src/cpp b/esm/js && cp -r nur/src/cpp/bridge b/src/cpp/ && git -C unrar-src archive --prefix=unrar/ 22b5243 | tar -x -C b/src/cpp
FILES="dll qopen rar strlist strfn pathfn smallfn global filcreat archive arcread unicode system crypt crc rawread encname resource match timefn rdwrfn consio options errhnd rarvm secpassword rijndael getbits sha1 sha256 blake2s hash extinfo extract volume list unpack headers threadpool rs16 cmddata ui"
SRCS=$(for f in $FILES; do printf "./src/cpp/unrar/%s.cpp " $f; done)"./src/cpp/bridge/bridge.cpp ./src/cpp/bridge/file.cpp ./src/cpp/bridge/filefn.cpp ./src/cpp/bridge/find.cpp"
cd b && EM_CONFIG=$W/emsc/.emscripten EM_CACHE=$W/emcache python3 $W/emsc/emcc.py --bind -Wno-switch -Wno-dangling-else -Wno-logical-op-parentheses -DRARDLL -std=c++17 \
  -s MODULARIZE -s ALLOW_MEMORY_GROWTH=1 -s EXPORT_ES6=1 -s USE_ES6_IMPORT_META=0 -s ENVIRONMENT=web,webview,worker -s FILESYSTEM=0 \
  -s DISABLE_EXCEPTION_CATCHING=0 -s "EXPORTED_RUNTIME_METHODS=['setTempRet0']" -O3 --js-library ./src/cpp/bridge/bridge.js -o ./esm/js/unrar.js $SRCS
# JS-Teil (TypeScript → JavaScript) zu einem Modul wie jsDelivrs „+esm“ zusammensetzen
node -e "
const m = require('node:module'), fs = require('fs'), J = (f, keep) => { let t = m.stripTypeScriptTypes(fs.readFileSync('$W/nur/src/js/' + f + '.ts', 'utf8'), { mode: 'transform' }).replace(/^import .*\n/gm, ''); return keep ? t : t.replace(/^export /gm, ''); };
fs.writeFileSync('esm/nur.mjs', \"import unrarFactory from './js/unrar.js';\n\" + J('Extractor', true) + J('ExtractorData.helper') + J('ExtractorData') +
  'let unrar; async function getUnrar(o) { if (!unrar) unrar = await unrarFactory(o); return unrar; }\n' +
  \"export async function createExtractorFromData({ wasmBinary, data, password = '' }) { const u = await getUnrar(wasmBinary && { wasmBinary }); const e = new ExtractorData(u, data, password); u.extractor = e; return e; }\n\");
" 2>/dev/null
mkdir -p $OUT && cp -r esm $OUT/ && ls -la $OUT/esm $OUT/esm/js
