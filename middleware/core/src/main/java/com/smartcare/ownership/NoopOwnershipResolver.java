package com.smartcare.ownership;

import com.smartcare.persistence.Measurement;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.Optional;

@ApplicationScoped
public class NoopOwnershipResolver implements OwnershipResolver {

    @Override
    public OwnershipResolution resolve(Measurement measurement) {
        return OwnershipResolution.unowned();
    }
}
