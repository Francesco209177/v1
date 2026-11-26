// Funzioni che la libreria Swift espone al ponte JNI (definite in Portable/Bridge/Exports.swift).
#ifndef MAREA_JNI_H
#define MAREA_JNI_H

#include <stdint.h>

typedef void (*marea_log_hook)(const char *text);

void marea_set_log(marea_log_hook hook);
void marea_boot(const char *assets, const char *saves, int32_t width, int32_t height,
                int32_t left, int32_t top, int32_t right, int32_t bottom);
void marea_resize(int32_t width, int32_t height, int32_t left, int32_t top, int32_t right, int32_t bottom);
void marea_frame(double dt);
int32_t marea_layout_version(void);
void *marea_layer_pixels(int32_t index);
int32_t marea_layer_width(int32_t index);
int32_t marea_layer_height(int32_t index);
int32_t marea_layer_scale(int32_t index);
void marea_touch(int32_t id, int32_t phase, float x, float y);
void marea_pad(int32_t connected, float lx, float ly, float rx, float ry, int32_t dpad_x, int32_t dpad_y, int32_t buttons);
void marea_back(void);
int32_t marea_haptic(void);
int32_t marea_quit_requested(void);
void marea_audio(int16_t *out, int32_t frames);
void marea_pause(void);
void marea_smoke_start(const char *directory);
int32_t marea_smoke_finished(void);

#endif
