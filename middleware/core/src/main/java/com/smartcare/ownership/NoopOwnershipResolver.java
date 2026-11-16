package com.smartcare.ownership;

import com.smartcare.persistence.Measurement;

import jakarta.enterprise.inject.Alternative;

/**
 * Test/helper fallback; kept as an explicit CDI alternative so production injection
 * resolves to {@link DeviceOwnershipResolver}.
 */
@Alternative
public class NoopOwnershipResolver implements OwnershipResolver {

    @Override
    public OwnershipResolution resolve(Measurement measurement) {
        return OwnershipResolution.notOwned();
    }
}
