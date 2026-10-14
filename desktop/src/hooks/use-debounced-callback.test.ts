import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEBOUNCE_MS, useDebouncedCallback } from "@/hooks/use-debounced-callback";

describe("useDebouncedCallback", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("usa los 500 ms de la GTK por defecto", () => {
        expect(DEBOUNCE_MS).toBe(500);
    });

    it("agrupa llamadas seguidas y corre solo la última", () => {
        const spy = vi.fn();
        const { result } = renderHook(() => useDebouncedCallback(spy));
        act(() => {
            result.current("a");
            vi.advanceTimersByTime(300);
            result.current("b");
            vi.advanceTimersByTime(499);
        });
        expect(spy).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(1));
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith("b");
    });

    it("cancel descarta y flush ejecuta ya lo pendiente", () => {
        const spy = vi.fn();
        const { result } = renderHook(() => useDebouncedCallback(spy, 100));
        act(() => {
            result.current(1);
            result.current.cancel();
            vi.advanceTimersByTime(200);
        });
        expect(spy).not.toHaveBeenCalled();
        act(() => {
            result.current(2);
            result.current.flush();
        });
        expect(spy).toHaveBeenCalledWith(2);
        act(() => vi.advanceTimersByTime(200));
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it("corre el callback más reciente aunque cambie entre renders", () => {
        const first = vi.fn();
        const second = vi.fn();
        const { result, rerender } = renderHook(({ cb }) => useDebouncedCallback(cb), {
            initialProps: { cb: first },
        });
        act(() => result.current());
        rerender({ cb: second });
        act(() => vi.advanceTimersByTime(DEBOUNCE_MS));
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it("no deja temporizadores vivos al desmontar", () => {
        const spy = vi.fn();
        const { result, unmount } = renderHook(() => useDebouncedCallback(spy));
        act(() => result.current());
        unmount();
        vi.advanceTimersByTime(DEBOUNCE_MS * 2);
        expect(spy).not.toHaveBeenCalled();
    });
});
