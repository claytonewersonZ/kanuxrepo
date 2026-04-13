package com.kanux.config;

import com.kanux.dto.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleException(Exception e) {
        log.error("Unhandled exception: {} — {}", e.getClass().getSimpleName(), e.getMessage(), e);
        String msg = e.getClass().getSimpleName() + ": " + e.getMessage();
        return ResponseEntity.internalServerError().body(ApiResponse.fail(msg));
    }
}
