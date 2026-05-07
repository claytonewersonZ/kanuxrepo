package com.kanux.config;

import com.kanux.dto.ApiResponse;
import com.kanux.exception.OutsideWorkingHoursException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * Broken pipe / cliente desconectou antes de receber a resposta.
     * É um evento normal em redes móveis — logamos como DEBUG para não poluir o log.
     */
    @ExceptionHandler(AsyncRequestNotUsableException.class)
    public void handleAsyncNotUsable(AsyncRequestNotUsableException e) {
        log.debug("[Network] Cliente desconectou antes da resposta: {}", e.getMessage());
        // Sem ResponseEntity — a resposta já não pode ser enviada
    }

    @ExceptionHandler(OutsideWorkingHoursException.class)
    public ResponseEntity<ApiResponse<Void>> handleOutsideWorkingHours(OutsideWorkingHoursException e) {
        return ResponseEntity.status(403).body(ApiResponse.fail(e.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleException(Exception e) {
        // Broken pipe envolto em outra exceção — ignora silenciosamente
        if (isBrokenPipe(e)) {
            log.debug("[Network] Broken pipe (cliente desconectou): {}", e.getMessage());
            return null;
        }
        log.error("Exceção não tratada: {} — {}", e.getClass().getSimpleName(), e.getMessage(), e);
        String msg = e.getClass().getSimpleName() + ": " + e.getMessage();
        return ResponseEntity.internalServerError().body(ApiResponse.fail(msg));
    }

    private boolean isBrokenPipe(Throwable e) {
        Throwable cause = e;
        for (int i = 0; i < 6 && cause != null; i++) {
            String msg = cause.getMessage();
            if (msg != null && (msg.contains("Broken pipe") || msg.contains("Pipe quebrado")
                    || msg.contains("Connection reset by peer"))) {
                return true;
            }
            cause = cause.getCause();
        }
        return false;
    }
}
