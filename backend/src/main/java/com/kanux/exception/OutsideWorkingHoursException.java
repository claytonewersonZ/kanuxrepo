package com.kanux.exception;

public class OutsideWorkingHoursException extends RuntimeException {

    public OutsideWorkingHoursException(String message) {
        super(message);
    }
}