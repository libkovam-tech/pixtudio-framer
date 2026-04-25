# syntax=docker/dockerfile-upstream:master-labs

# Pragmatically reduced custom ffmpeg.wasm core for PIXTUDIO Quantization Recorder
#
# Target pipeline:
#   PNG sequence -> MP4 (H.264/AAC)
#   optional audio comes in as browser-normalized WAV/PCM
#
# This keeps the build lean but intentionally avoids --disable-everything.
# We keep FFmpeg's regular internal plumbing so libx264 can open reliably
# inside wasm, while still stripping large optional areas by not building
# any extra external codec stacks beyond x264 + zlib.

FROM emscripten/emsdk:3.1.40 AS emsdk-base
ARG EXTRA_CFLAGS
ARG EXTRA_LDFLAGS
ARG FFMPEG_ST
ARG FFMPEG_MT
ENV INSTALL_DIR=/opt
ENV FFMPEG_VERSION=n5.1.4
ENV CFLAGS="-I$INSTALL_DIR/include $CFLAGS $EXTRA_CFLAGS"
ENV CXXFLAGS="$CFLAGS"
ENV LDFLAGS="-L$INSTALL_DIR/lib $LDFLAGS $CFLAGS $EXTRA_LDFLAGS"
ENV EM_PKG_CONFIG_PATH=$EM_PKG_CONFIG_PATH:$INSTALL_DIR/lib/pkgconfig:/emsdk/upstream/emscripten/system/lib/pkgconfig
ENV EM_TOOLCHAIN_FILE=$EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake
ENV PKG_CONFIG_PATH=$PKG_CONFIG_PATH:$EM_PKG_CONFIG_PATH
ENV FFMPEG_ST=${FFMPEG_ST:-yes}
ENV FFMPEG_MT=$FFMPEG_MT
RUN apt-get update && \
      apt-get install -y pkg-config autoconf automake libtool ragel

FROM emsdk-base AS zlib-builder
ENV ZLIB_BRANCH=v1.2.11
ADD https://github.com/madler/zlib.git#$ZLIB_BRANCH /src
COPY build/zlib.sh /src/build.sh
RUN bash -x /src/build.sh

FROM emsdk-base AS x264-builder
ENV X264_BRANCH=4-cores
ADD https://github.com/ffmpegwasm/x264.git#$X264_BRANCH /src
COPY build/x264.sh /src/build.sh
RUN bash -x /src/build.sh

FROM emsdk-base AS ffmpeg-base
RUN embuilder build sdl2 sdl2-mt
ADD https://github.com/FFmpeg/FFmpeg.git#$FFMPEG_VERSION /src
COPY --from=zlib-builder $INSTALL_DIR $INSTALL_DIR
COPY --from=x264-builder $INSTALL_DIR $INSTALL_DIR

FROM ffmpeg-base AS ffmpeg-builder
COPY build/ffmpeg.sh /src/build.sh
RUN bash -x /src/build.sh \
      --enable-gpl \
      --enable-zlib \
      --enable-libx264 \
      --disable-network

FROM ffmpeg-builder AS ffmpeg-wasm-builder
COPY src/bind /src/src/bind
COPY src/fftools /src/src/fftools
COPY build/ffmpeg-wasm.sh build.sh
ENV FFMPEG_LIBS \
      -lx264 \
      -lz
RUN mkdir -p /src/dist/umd && bash -x /src/build.sh \
      ${FFMPEG_LIBS} \
      -o dist/umd/ffmpeg-core.js
RUN mkdir -p /src/dist/esm && bash -x /src/build.sh \
      ${FFMPEG_LIBS} \
      -sEXPORT_ES6 \
      -o dist/esm/ffmpeg-core.js

FROM scratch AS exportor
COPY --from=ffmpeg-wasm-builder /src/dist /dist
